import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createJob, randomTestIp, uploadFile } from "./helpers/api";

/**
 * Server-side abuse controls on the two expensive endpoints
 * (lib/security/abuseLimits.ts, lib/security/requestBody.ts), exercised
 * the way a script would call them, not through the UI. Every test uses
 * its own fake client IP so its buckets don't affect other tests. These
 * assume the default limits (no *_RATE_LIMIT_* overrides in the env).
 */
const NOT_A_PDF = { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") };

test("an upload without a toolId is rejected before the body is read", async ({ request }) => {
  const response = await request.post("/api/upload", {
    multipart: { file: NOT_A_PDF },
    headers: { "x-forwarded-for": randomTestIp() },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
});

test("an upload larger than the actor's per-tool limit is refused with 413", async ({ request }) => {
  // Guest compress-pdf limit is 20MB (lib/tools/registry.ts / seeded ToolLimit).
  const oversized = Buffer.alloc(21 * 1024 * 1024, 0x20);
  oversized.write("%PDF-1.7\n", 0, "latin1");
  const response = await uploadFile(
    request,
    "compress-pdf",
    { name: "big.pdf", mimeType: "application/pdf", buffer: oversized },
    randomTestIp(),
  );
  expect(response.status()).toBe(413);
  expect((await response.json()).error.code).toBe("FILE_TOO_LARGE");
});

test("one actor is rate-limited after 100 uploads in the window", async ({ request }) => {
  test.setTimeout(120_000);
  const ip = randomTestIp();
  const statuses: number[] = [];
  for (let i = 0; i < 101; i++) {
    statuses.push((await uploadFile(request, "compress-pdf", NOT_A_PDF, ip)).status());
  }
  // The first 100 are judged on their content (an invalid file: 415).
  expect(statuses.slice(0, 100).every((status) => status === 415)).toBe(true);
  expect(statuses[100]).toBe(429);
});

test("discarding the guest cookie doesn't escape the per-IP upload limit", async () => {
  test.setTimeout(180_000);
  const ip = randomTestIp();
  let limited = 0;
  // Each request is a brand-new guest (fresh context, no cookie): only the
  // per-IP bucket (200) connects them.
  for (let i = 0; i < 201; i++) {
    const context = await playwrightRequest.newContext({ baseURL: "http://localhost:3000" });
    const status = (await uploadFile(context, "compress-pdf", NOT_A_PDF, ip)).status();
    if (status === 429) limited += 1;
    await context.dispose();
  }
  expect(limited).toBe(1);
});

test("one actor is rate-limited after 100 job-creation requests in the window", async ({ request }) => {
  test.setTimeout(120_000);
  const ip = randomTestIp();
  const statuses: number[] = [];
  for (let i = 0; i < 101; i++) {
    statuses.push((await createJob(request, { toolId: "compress-pdf", fileIds: ["does-not-exist"] }, ip)).status());
  }
  // Not this actor's file: 403 until the rate limit takes over.
  expect(statuses.slice(0, 100).every((status) => status === 403)).toBe(true);
  expect(statuses[100]).toBe(429);
});

// The lying/missing Content-Length cases are covered directly against
// readBodyWithLimit in security-helpers.spec.ts.
test("a job-creation body over the 50MB cap is refused with 413", async ({
  request,
}) => {
  const response = await request.post("/api/jobs", {
    headers: { "content-type": "application/json", "x-forwarded-for": randomTestIp() },
    data: Buffer.from(JSON.stringify({ toolId: "edit-pdf", fileIds: ["x"], options: { pad: "a".repeat(51 * 1024 * 1024) } })),
  });
  expect(response.status()).toBe(413);
});
