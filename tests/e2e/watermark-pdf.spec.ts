import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");
const WATERMARK_TEXT = "CONFIDENTIAL-TEST";

/**
 * Real pipeline end to end: upload a 3-page PDF, stamp a distinctive
 * watermark, download the result, and verify the watermark text actually
 * appears in the extracted text of every page (not just that the file is a
 * valid PDF with the same page count).
 */
test("guest can watermark a real PDF and every page carries the watermark text", async ({
  page,
}) => {
  await page.goto("/en/watermark-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Watermark text").fill(WATERMARK_TEXT);

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
  const watermarked = await PDFDocument.load(bytes);
  expect(watermarked.getPageCount()).toBe(3);

  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts).toHaveLength(3);
  for (const text of pageTexts) {
    expect(text).toContain(WATERMARK_TEXT);
  }
});
