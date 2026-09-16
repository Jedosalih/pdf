import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-with-form-field.pdf");

/**
 * Real pipeline end to end. The fixture has one genuine AcroForm text
 * field (confirmed below before asserting anything about the output) —
 * flattening must actually remove it, not just pass the file through
 * unchanged.
 */
test("guest can flatten a real PDF's form field into static content", async ({ page }) => {
  const inputBytes = await readFile(fixture);
  const inputDoc = await PDFDocument.load(inputBytes);
  expect(inputDoc.getForm().getFields().length).toBe(1);

  await page.goto("/en/flatten-pdf");
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

  const outputBytes = await readFile(downloadPath as string);
  const outputDoc = await PDFDocument.load(outputBytes);
  expect(outputDoc.getPageCount()).toBe(1);
  expect(outputDoc.getForm().getFields().length).toBe(0);
});
