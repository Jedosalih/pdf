import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf");

/**
 * Real pipeline end to end: upload a 6-page PDF, reorder pages via the
 * move-later buttons, download the result, and verify — by reading each
 * page's actual text content — that the pages moved to the exact expected
 * positions. A page-count check alone can't tell a correctly reordered
 * document from an untouched one, so this checks content order directly.
 */
test("guest can reorder pages of a real PDF and the content order matches", async ({
  page,
}) => {
  await page.goto("/en/reorder-pages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByRole("button", { name: "Move page 1 later" })).toBeVisible({
    timeout: 15_000,
  });

  // Start: [1,2,3,4,5,6]. Move position 1 later -> [2,1,3,4,5,6].
  await page.getByRole("button", { name: "Move page 1 later" }).click();
  // Move position 3 later -> [2,1,4,3,5,6].
  await page.getByRole("button", { name: "Move page 3 later" }).click();

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
  expect(result.getPageCount()).toBe(6);

  const lines = await extractFirstLinePerPage(bytes);
  expect(lines).toEqual([
    "Fixture-C - page 2",
    "Fixture-C - page 1",
    "Fixture-C - page 4",
    "Fixture-C - page 3",
    "Fixture-C - page 5",
    "Fixture-C - page 6",
  ]);
});
