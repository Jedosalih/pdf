import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");
const TITLE = "Quarterly Report";
const AUTHOR = "Jane Doe";
const SUBJECT = "Finance";
const KEYWORDS = "invoice, 2026, confidential";

/**
 * Real pipeline end to end: upload a PDF, set title/author/subject/keywords,
 * download the result, and read the actual metadata fields back out via
 * pdf-lib — not just check the file is still a valid PDF with the right
 * page count (a broken handler that ignored every option would still pass
 * that).
 */
test("guest can edit a real PDF's metadata fields", async ({ page }) => {
  await page.goto("/en/pdf-metadata");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("Author").fill(AUTHOR);
  await page.getByLabel("Subject").fill(SUBJECT);
  await page.getByLabel("Keywords").fill(KEYWORDS);

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
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getTitle()).toBe(TITLE);
  expect(doc.getAuthor()).toBe(AUTHOR);
  expect(doc.getSubject()).toBe(SUBJECT);
  expect(doc.getKeywords()).toBe("invoice 2026 confidential");
});
