import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

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

  // Scoped to end in ".pdf" so this doesn't also match the "Download all as
  // ZIP" link below (both accessible names contain the substring "Download").
  const downloadLinks = page.getByRole("link", { name: /\.pdf$/ });
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

  // "Download all as ZIP" — verify the archive is real (decodable, exact
  // entry count) and each entry is itself a genuinely valid 2-page PDF, not
  // just that the HTTP request for the archive succeeded.
  const zipLink = page.getByRole("link", { name: "Download all as ZIP" });
  const [zipDownload] = await Promise.all([page.waitForEvent("download"), zipLink.click()]);
  const zipPath = await zipDownload.path();
  expect(zipPath).not.toBeNull();

  const zipBytes = await readFile(zipPath as string);
  const zip = await JSZip.loadAsync(zipBytes);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  expect(entries).toHaveLength(3);

  for (const entry of entries) {
    const entryBytes = await entry.async("nodebuffer");
    const part = await PDFDocument.load(entryBytes);
    expect(part.getPageCount()).toBe(2);
  }
});
