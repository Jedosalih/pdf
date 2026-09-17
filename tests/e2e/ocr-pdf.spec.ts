import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-image-only.pdf");

/**
 * Real pipeline end to end. The fixture is genuinely image-only (verified
 * separately before writing this test — no pre-existing text layer, so a
 * broken OCR handler that just passed the file through untouched would
 * fail this test, unlike a page-count-only check). Asserts the real
 * recognized text is present with a substring match (not exact equality)
 * since OCR engines can introduce minor character-level noise even on a
 * clean rendered fixture.
 */
test("guest can OCR a genuinely image-only PDF and get searchable text", async ({ page }) => {
  await page.goto("/en/ocr-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  // Default language selection is English, matching the fixture's text.
  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 90_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const bytes = await readFile(downloadPath as string);
  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts.join(" ")).toContain("OcrFixtureMarker12345");
});
