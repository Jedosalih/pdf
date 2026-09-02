import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf");

/**
 * Real pipeline end to end: upload a 6-page PDF, select pages 1, 3, and 5
 * to keep, download the result, and verify — by reading actual page text —
 * that exactly those pages are present, in order.
 */
test("guest can extract specific pages from a real PDF", async ({ page }) => {
  await page.goto("/en/extract-pages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByRole("button", { name: "Select page 1" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Select page 1" }).click();
  await page.getByRole("button", { name: "Select page 3" }).click();
  await page.getByRole("button", { name: "Select page 5" }).click();
  await expect(page.getByText("3 of 6 pages selected")).toBeVisible();

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
  expect(result.getPageCount()).toBe(3);

  const lines = await extractFirstLinePerPage(bytes);
  expect(lines).toEqual([
    "Fixture-C - page 1",
    "Fixture-C - page 3",
    "Fixture-C - page 5",
  ]);
});
