import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const mildFixture = path.join(__dirname, "../../docs/fixtures/sample-mild-corrupt.pdf");
const severeFixture = path.join(__dirname, "../../docs/fixtures/sample-severe-corrupt.pdf");

/**
 * Real pipeline end to end, both directions. The mild fixture has a
 * mangled startxref pointer but an otherwise intact classic xref table —
 * qpdf's own recovery reconstructs it (verified against the real binary:
 * exits 3, "succeeded with warnings", not 0). The severe fixture is
 * truncated to 40% of its original size, destroying the xref/trailer and
 * most page content — verified that neither qpdf nor Ghostscript can
 * produce a genuinely usable document from it, which repair-pdf must
 * report as UNRECOVERABLE_FILE rather than silently returning a broken
 * "success".
 */
test("guest can repair a mildly damaged PDF and recover its real content", async ({ page }) => {
  await page.goto("/en/repair-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([mildFixture]);
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

  const bytes = await readFile(downloadPath as string);
  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts).toEqual([
    "Repair-Fixture - page 1",
    "Repair-Fixture - page 2",
    "Repair-Fixture - page 3",
  ]);
});

test("guest sees a clear error for a PDF too damaged to repair", async ({ page }) => {
  await page.goto("/en/repair-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([severeFixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("This file is too damaged to repair.")).toBeVisible({
    timeout: 30_000,
  });
});
