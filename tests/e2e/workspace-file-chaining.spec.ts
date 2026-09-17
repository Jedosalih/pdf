import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

/**
 * Real pipeline end to end: a signed-in user's own prior job *output*
 * (not a fresh upload) is picked up directly from the workspace and used
 * as the input to a completely different tool, with no re-upload round
 * trip -- verified by the destination tool page never showing an
 * "Uploading..." state and the file appearing already at its real size,
 * and by the final result genuinely containing both the watermark text
 * added in this second job and the original fixture's own page content
 * (proving the chained bytes really came from the first job's output,
 * not some other/empty file).
 */
test("a signed-in user can chain a workspace file into a second tool without re-uploading", async ({
  page,
}) => {
  const email = `e2e-chain-${Date.now()}@example.com`;
  await page.goto("/en/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correcthorsebattery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/workspace");

  // A real completed job whose output becomes the file we'll chain.
  await page.goto("/en/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/en/workspace/documents");
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Use in a tool" }).click();
  await page.getByRole("button", { name: "Watermark PDF" }).click();
  await page.waitForURL("**/watermark-pdf");

  // The chained file must never go through an upload round trip.
  await expect(page.getByText("Uploading…")).toHaveCount(0);
  await expect(page.getByText("compressed.pdf")).toBeVisible();

  await page.getByLabel("Watermark text").fill("CHAINED-TEST");
  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = await readFile(downloadPath as string);

  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts).toHaveLength(2);
  for (const text of pageTexts) {
    expect(text).toContain("CHAINED-TEST");
    expect(text).toContain("Fixture-A");
  }
});
