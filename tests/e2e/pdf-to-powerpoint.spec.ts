import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end. This tool deliberately does NOT use
 * LibreOffice (verified empirically that PDF-to-Impress silently produces
 * a 0-slide file — see docs/DECISIONS.md) — the real engine is
 * `pdftoppm` rasterization + pptxgenjs, one image-filled slide per PDF
 * page. Verifies the real slide count matches the fixture's page count
 * and that each slide actually embeds an image — not just that a .pptx
 * file came back.
 */
test("guest can convert a real PDF into a PowerPoint presentation", async ({ page }) => {
  await page.goto("/en/pdf-to-powerpoint");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const bytes = await readFile(downloadPath as string);
  const zip = await JSZip.loadAsync(bytes);

  const slideFiles = Object.keys(zip.files).filter(
    (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name),
  );
  expect(slideFiles.length).toBe(3);

  const mediaFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("ppt/media/") && !zip.files[name]!.dir,
  );
  expect(mediaFiles.length).toBe(3);
});
