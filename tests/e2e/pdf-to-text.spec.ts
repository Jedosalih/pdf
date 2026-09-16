import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end: upload a 3-page PDF, convert to text, download
 * the result, and verify the exact fixture strings survived extraction —
 * not just that a .txt file came back.
 */
test("guest can extract real text from a PDF", async ({ page }) => {
  await page.goto("/en/pdf-to-text");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const text = await readFile(downloadPath as string, "utf-8");
  expect(text).toContain("Fixture-B - page 1");
  expect(text).toContain("Fixture-B - page 2");
  expect(text).toContain("Fixture-B - page 3");
});
