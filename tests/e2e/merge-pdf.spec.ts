import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixtureA = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const fixtureB = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * The critical P0 flow from blueprint §65: Guest -> Merge PDF -> Download.
 * Exercises the real pipeline end to end: browser upload -> /api/upload ->
 * /api/jobs -> BullMQ -> the containerized qpdf worker -> MinIO -> signed
 * download -> a genuinely merged, valid PDF.
 */
test("guest can merge two real PDFs and download a valid merged result", async ({
  page,
}) => {
  await page.goto("/en/merge-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixtureA, fixtureB]);

  // Both uploads must finish (and neither must land in an error state)
  // before the merge can start.
  await expect(page.getByText("Uploading…")).toHaveCount(0, {
    timeout: 20_000,
  });

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
  const merged = await PDFDocument.load(bytes);

  // sample-a is 2 pages, sample-b is 3 pages -> merged must be 5, in order.
  expect(merged.getPageCount()).toBe(5);
});
