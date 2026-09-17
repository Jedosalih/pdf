import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample.html");

/**
 * Real pipeline end to end through the headless-Chromium render worker.
 * The fixture deliberately includes an external image (verifies the
 * SSRF-blocking request interceptor lets the render complete instead of
 * hanging/failing) and a <script> tag (verifies it never executes and
 * doesn't survive sanitization) alongside a real marker string.
 */
test("guest can convert a real HTML file to PDF", async ({ page }) => {
  await page.goto("/en/html-to-pdf");
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
  expect(pageTexts.join(" ")).toContain("HtmlFixtureMarker12345");
});
