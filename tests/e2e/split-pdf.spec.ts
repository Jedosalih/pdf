import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf");

/**
 * Real pipeline end to end: upload a 6-page PDF, split every 2 pages,
 * verify all 3 resulting files download and each is a genuinely valid
 * 2-page PDF (not just that the HTTP calls succeeded).
 */
test("guest can split a real PDF into multiple valid files", async ({ page }) => {
  await page.goto("/en/split-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const pagesPerFileInput = page.getByLabel("Pages per file");
  await pagesPerFileInput.fill("2");

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLinks = page.getByRole("link", { name: "Download" });
  await expect(downloadLinks).toHaveCount(3, { timeout: 30_000 });

  for (let i = 0; i < 3; i += 1) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLinks.nth(i).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    const bytes = await readFile(downloadPath as string);
    const part = await PDFDocument.load(bytes);
    expect(part.getPageCount()).toBe(2);
  }
});
