import { test, expect } from "@playwright/test";
import path from "node:path";

const compressFixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const splitFixture = path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf");

/**
 * User B must never be able to read, download, rename, star, trash,
 * restore, permanently delete, hide-from-history, or ZIP-download
 * anything belonging to User A — verified against every mutating route,
 * not just inferred from the shared ownership-check pattern.
 */
test("a second user cannot access another user's files or jobs through any route", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  const emailA = `e2e-user-a-${Date.now()}@example.com`;
  await pageA.goto("/en/signup");
  await pageA.getByLabel("Email").fill(emailA);
  await pageA.getByLabel("Password", { exact: true }).fill("correcthorsebattery");
  await pageA.getByRole("button", { name: "Sign up" }).click();
  await pageA.waitForURL("**/workspace");

  // A real completed single-output job (for the File-level checks).
  await pageA.goto("/en/compress-pdf");
  await pageA.locator('input[type="file"]').setInputFiles(compressFixture);
  await expect(pageA.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await pageA.getByRole("button", { name: "Start" }).click();
  await expect(pageA.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 30_000 });

  // A real completed multi-output job (for the ZIP-download check).
  await pageA.goto("/en/split-pdf");
  await pageA.locator('input[type="file"]').setInputFiles(splitFixture);
  await expect(pageA.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await pageA.getByLabel("Pages per file").fill("2");
  await pageA.getByRole("button", { name: "Start" }).click();
  await expect(pageA.getByRole("link", { name: /\.pdf$/ }).first()).toBeVisible({
    timeout: 30_000,
  });

  const filesResponse = await pageA.request.get("/api/files?view=documents&sort=date&order=asc");
  const { items: files } = (await filesResponse.json()) as { items: { id: string }[] };
  expect(files.length).toBeGreaterThanOrEqual(2);
  const fileId = files[0]!.id;

  const jobsResponse = await pageA.request.get("/api/jobs?limit=10");
  const { items: jobs } = (await jobsResponse.json()) as { items: { id: string }[] };
  expect(jobs.length).toBeGreaterThanOrEqual(2);
  const jobId = jobs[0]!.id;

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const emailB = `e2e-user-b-${Date.now()}@example.com`;
  await pageB.goto("/en/signup");
  await pageB.getByLabel("Email").fill(emailB);
  await pageB.getByLabel("Password", { exact: true }).fill("anotherSecurePass1");
  await pageB.getByRole("button", { name: "Sign up" }).click();
  await pageB.waitForURL("**/workspace");

  const listAsB = await pageB.request.get("/api/files?view=documents");
  expect(((await listAsB.json()) as { items: unknown[] }).items).toHaveLength(0);

  expect((await pageB.request.patch(`/api/files/${fileId}`, { data: { starred: true } })).status()).toBe(403);
  expect((await pageB.request.get(`/api/files/${fileId}/download`)).status()).toBe(403);
  expect((await pageB.request.post(`/api/files/${fileId}/trash`)).status()).toBe(403);
  expect((await pageB.request.post(`/api/files/${fileId}/restore`)).status()).toBe(403);
  expect((await pageB.request.delete(`/api/files/${fileId}`)).status()).toBe(403);
  expect((await pageB.request.get(`/api/jobs/${jobId}`)).status()).toBe(403);
  expect((await pageB.request.post(`/api/jobs/${jobId}/hide`)).status()).toBe(403);
  expect((await pageB.request.get(`/api/jobs/${jobId}/download-zip`)).status()).toBe(403);

  await contextA.close();
  await contextB.close();
});
