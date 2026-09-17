import { test, expect } from "@playwright/test";
import path from "node:path";
import ExcelJS from "exceljs";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end. This tool deliberately does NOT use
 * LibreOffice (verified empirically that PDF-to-Calc crashes soffice
 * outright — see docs/DECISIONS.md) — the real engine is
 * `pdftotext -layout` + exceljs. Verifies the actual fixture text landed
 * in real worksheet cells, not just that an .xlsx file came back.
 */
test("guest can convert a real PDF's text into an Excel spreadsheet", async ({ page }) => {
  await page.goto("/en/pdf-to-excel");
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

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(downloadPath as string);
  const sheet = workbook.worksheets[0];
  expect(sheet).toBeDefined();

  const cellValues: string[] = [];
  sheet!.eachRow((row) => {
    row.eachCell((cell) => {
      cellValues.push(String(cell.value ?? ""));
    });
  });

  expect(cellValues).toContain("Fixture-B - page 1");
  expect(cellValues).toContain("Fixture-B - page 2");
  expect(cellValues).toContain("Fixture-B - page 3");
});
