import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end: upload a 3-page PDF, convert to PNG, and
 * verify exactly 3 output files download, each a genuinely valid PNG
 * (decoded via sharp, not just checked for magic bytes).
 */
test("guest can convert a real PDF into valid PNG images", async ({ page }) => {
  await page.goto("/en/pdf-to-png");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLinks = page.locator('a[aria-label^="Download page-"]');
  await expect(downloadLinks).toHaveCount(3, { timeout: 30_000 });

  for (let i = 0; i < 3; i += 1) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLinks.nth(i).click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    const bytes = await readFile(downloadPath as string);
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);
  }
});
