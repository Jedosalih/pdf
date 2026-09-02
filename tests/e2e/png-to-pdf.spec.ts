import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-graphic.png");

/**
 * Real pipeline end to end: upload two copies of a genuine 300x200 PNG,
 * convert to PDF, download the result, and verify it's a valid 2-page PDF
 * (one page per image) with landscape pages matching the source aspect
 * ratio.
 */
test("guest can convert real PNGs to a valid multi-page PDF", async ({ page }) => {
  await page.goto("/en/png-to-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture, fixture]);

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
  expect(result.getPageCount()).toBe(2);

  for (const pdfPage of result.getPages()) {
    const { width, height } = pdfPage.getSize();
    expect(width).toBeGreaterThan(height);
  }
});
