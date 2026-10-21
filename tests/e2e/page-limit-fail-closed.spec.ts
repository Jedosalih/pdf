import { test, expect, request as playwrightRequest } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { createJob, downloadFile, randomTestIp, runTool, uploadFile } from "./helpers/api";

/**
 * The maxPages gate fails closed (lib/security/pageCount.ts). A PDF whose
 * pages can't be counted used to count as 0 pages and pass any limit.
 * Tools whose purpose is unreadable input (unlock-pdf, repair-pdf) defer
 * the same limit to their worker instead.
 */
const PASSWORD = "page-limit-test";

async function blankPdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([100, 100]);
  return Buffer.from(await doc.save());
}

async function protect(request: Parameters<typeof runTool>[0], pdf: Buffer, ip: string): Promise<Buffer> {
  const job = await runTool(
    request,
    "protect-pdf",
    { name: "plain.pdf", mimeType: "application/pdf", buffer: pdf },
    { password: PASSWORD },
    ip,
  );
  expect(job.status).toBe("COMPLETED");
  return downloadFile(request, job.outputFiles[0]!.id, ip);
}

// Regression: until 2026-10-21 page counting threw inside the Next.js
// server bundle on every file and the error was turned into "0 pages", so
// this limit was never enforced at runtime at all.
test("a PDF over the actor's page limit is refused at job creation", async ({ request }) => {
  const ip = randomTestIp();
  // Guest compress-pdf allows 300 pages.
  const upload = await uploadFile(
    request,
    "compress-pdf",
    { name: "301.pdf", mimeType: "application/pdf", buffer: await blankPdf(301) },
    ip,
  );
  expect(upload.status()).toBe(200);
  const { fileId } = await upload.json();
  const job = await createJob(request, { toolId: "compress-pdf", fileIds: [fileId], options: { level: "balanced" } }, ip);
  expect(job.status()).toBe(400);
  expect((await job.json()).error.code).toBe("TOO_MANY_PAGES");

  const atLimit = await uploadFile(
    request,
    "compress-pdf",
    { name: "300.pdf", mimeType: "application/pdf", buffer: await blankPdf(300) },
    ip,
  );
  const ok = await createJob(
    request,
    { toolId: "compress-pdf", fileIds: [(await atLimit.json()).fileId], options: { level: "balanced" } },
    ip,
  );
  expect(ok.status()).toBe(200);
});

test("a password-protected PDF is refused by tools that can't read it", async ({ request }) => {
  const ip = randomTestIp();
  const encrypted = await protect(request, await blankPdf(2), ip);

  const upload = await uploadFile(request, "compress-pdf", { name: "enc.pdf", mimeType: "application/pdf", buffer: encrypted }, ip);
  expect(upload.status()).toBe(200);
  const { fileId } = await upload.json();
  const job = await createJob(request, { toolId: "compress-pdf", fileIds: [fileId], options: { level: "balanced" } }, ip);
  expect(job.status()).toBe(415);
  expect((await job.json()).error.code).toBe("ENCRYPTED_PDF");
});

test("an unparseable 'PDF' no longer slips past the page limit as 0 pages", async ({ request }) => {
  const ip = randomTestIp();
  const garbage = Buffer.from("%PDF-1.7\n" + "not really a pdf ".repeat(200));
  const upload = await uploadFile(request, "compress-pdf", { name: "bad.pdf", mimeType: "application/pdf", buffer: garbage }, ip);
  expect(upload.status()).toBe(200);
  const { fileId } = await upload.json();
  const job = await createJob(request, { toolId: "compress-pdf", fileIds: [fileId], options: { level: "balanced" } }, ip);
  expect(job.status()).toBe(415);
  expect((await job.json()).error.code).toBe("UNSUPPORTED_FILE");
});

test("unlock-pdf still accepts encrypted input and unlocks it", async ({ request }) => {
  const ip = randomTestIp();
  const encrypted = await protect(request, await blankPdf(3), ip);
  const job = await runTool(
    request,
    "unlock-pdf",
    { name: "enc.pdf", mimeType: "application/pdf", buffer: encrypted },
    { password: PASSWORD },
    ip,
  );
  expect(job.status).toBe("COMPLETED");
  const unlocked = await PDFDocument.load(await downloadFile(request, job.outputFiles[0]!.id, ip));
  expect(unlocked.getPageCount()).toBe(3);
});

test("the deferred page limit is enforced by the worker and can't be overridden by the client", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Signed-in FREE protect-pdf allows 1000 pages; guest unlock-pdf allows
  // 300. A 301-page encrypted file is only countable after decryption.
  const userIp = randomTestIp();
  const userContext = await browser.newContext();
  const register = await userContext.request.post("/api/auth/register", {
    data: { email: `page-limit-${Date.now()}@example.com`, password: "correcthorsebattery" },
    headers: { "x-forwarded-for": userIp },
  });
  expect(register.ok()).toBe(true);
  const encrypted = await protect(userContext.request, await blankPdf(301), userIp);
  await userContext.close();

  const guestIp = randomTestIp();
  const guest = await playwrightRequest.newContext({ baseURL: "http://localhost:3000" });
  const job = await runTool(
    guest,
    "unlock-pdf",
    { name: "big-enc.pdf", mimeType: "application/pdf", buffer: encrypted },
    { password: PASSWORD, maxPages: 100_000 },
    guestIp,
  );
  expect(job.status).toBe("FAILED");
  expect(job.errorCode).toBe("TOO_MANY_PAGES");
  expect(job.outputFiles).toHaveLength(0);
  await guest.dispose();
});
