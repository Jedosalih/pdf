import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-photo.jpg");

/**
 * Real pipeline end to end: upload a genuine 300x200 JPEG, convert to PDF,
 * download the result, and verify it's a valid single-page PDF whose page
 * is landscape (matching the source image's orientation) — not just that
 * some PDF came back.
 */
test("guest can convert a real JPG to a valid PDF", async ({ page }) => {
  await page.goto("/en/jpg-to-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const bytes = await readFile(downloadPath as string);
  const result = await PDFDocument.load(bytes);
  expect(result.getPageCount()).toBe(1);

  const { width, height } = result.getPage(0).getSize();
  expect(width).toBeGreaterThan(height); // source image (300x200) is landscape
});
