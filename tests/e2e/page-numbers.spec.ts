import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf");
const START_AT = 5;

/**
 * Real pipeline end to end: upload a 6-page PDF, add page numbers starting
 * at 5, download the result, and verify the actual expected number string
 * (5, 6, 7, ...) is present in the extracted text of each page — not just
 * that the file is a valid PDF with the same page count.
 */
test("guest can add page numbers to a real PDF starting at a custom number", async ({
  page,
}) => {
  await page.goto("/en/page-numbers");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Start at").fill(String(START_AT));

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
  const numbered = await PDFDocument.load(bytes);
  expect(numbered.getPageCount()).toBe(6);

  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts).toHaveLength(6);
  pageTexts.forEach((text, index) => {
    expect(text).toContain(String(START_AT + index));
  });
});
