import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample.md");

/**
 * Real pipeline end to end: markdown-it parses the fixture (including a
 * table, list, and code block) to HTML, wrapped in the shared template,
 * then rendered through the same headless-Chromium path as html-to-pdf.
 * The fixture's raw <script> tag verifies `html: false` escaped it to
 * visible text rather than passing it through as live markup.
 */
test("guest can convert a real Markdown file to PDF", async ({ page }) => {
  await page.goto("/en/markdown-to-pdf");
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
  const fullText = pageTexts.join(" ");
  expect(fullText).toContain("MarkdownFixtureMarker12345");
});
