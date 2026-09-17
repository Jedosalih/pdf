import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixtureA = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const fixtureB = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end: two files uploaded to the default batch tool
 * (Compress PDF) become two entirely independent jobs, verified by
 * downloading *both* results and checking each is a valid PDF with the
 * page count matching its own source file -- not a merged, swapped, or
 * cross-contaminated result, which is the real risk this feature could
 * get wrong given both jobs run concurrently against the same tool.
 */
test("guest can batch-process multiple files and download each independently", async ({
  page,
}) => {
  await page.goto("/en/batch-process");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixtureA, fixtureB]);

  const rows = page.locator("li", { hasText: ".pdf" });
  await expect(rows).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const startButton = page.getByRole("button", { name: "Start batch" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLinks = page.getByRole("link", { name: "Download" });
  await expect(downloadLinks).toHaveCount(2, { timeout: 30_000 });

  const pageCounts: number[] = [];
  for (let i = 0; i < 2; i++) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLinks.nth(i).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const bytes = await readFile(downloadPath as string);
    const doc = await PDFDocument.load(bytes);
    pageCounts.push(doc.getPageCount());
  }

  // One result has 2 pages (from fixtureA), the other has 3 (from
  // fixtureB) -- order isn't guaranteed since both jobs run concurrently,
  // so check the set, not positional indices.
  expect(pageCounts.sort()).toEqual([2, 3]);
});
