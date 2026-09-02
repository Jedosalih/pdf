import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end through Ghostscript: upload a 3-page PDF,
 * compress at the default level, download the result, and verify it's a
 * genuinely valid PDF with the same page count (compression must not
 * corrupt or drop content).
 */
test("guest can compress a real PDF and download a valid result", async ({ page }) => {
  await page.goto("/en/compress-pdf");
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
  const compressed = await PDFDocument.load(bytes);
  expect(compressed.getPageCount()).toBe(3);
});
