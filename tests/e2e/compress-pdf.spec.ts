import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

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

  // This tiny vector fixture can't be made smaller (Ghostscript's rewrite
  // grew it 2.1 KB -> 4.8 KB): the result must never be larger than the
  // input, and the UI must say so instead of presenting it as compressed.
  expect(bytes.byteLength).toBeLessThanOrEqual((await readFile(fixture)).byteLength);
  await expect(page.getByTestId("compress-summary")).toContainText("already well optimized");
});

test("a PDF with a large photo really gets smaller", async ({ page }) => {
  const width = 2400;
  const height = 1800;
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const jpeg = await sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(jpeg);
  doc.addPage([600, 450]).drawImage(image, { x: 0, y: 0, width: 600, height: 450 });
  const input = Buffer.from(await doc.save());

  await page.goto("/en/compress-pdf");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles({ name: "photo.pdf", mimeType: "application/pdf", buffer: input });
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "Start" }).click();
  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const output = await readFile((await download.path()) as string);

  expect(output.byteLength).toBeLessThan(input.byteLength * 0.8);
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
  await expect(page.getByTestId("compress-summary")).toContainText("% smaller");
});
