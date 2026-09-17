import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample.docx");

/**
 * Real pipeline end to end through the LibreOffice-backed office worker:
 * upload a real DOCX (with a distinctive marker string), convert, and
 * verify the exact text survived — not just that a PDF came back.
 */
test("guest can convert a real Word document to PDF", async ({ page }) => {
  await page.goto("/en/word-to-pdf");
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
  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts.join(" ")).toContain("OfficeFixtureDocxMarker12345");
});
