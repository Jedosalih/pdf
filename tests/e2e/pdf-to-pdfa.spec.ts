import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end: upload a 3-page PDF, convert to (best-effort)
 * PDF/A, download the result, and verify it's a genuinely valid PDF with
 * the same page count *and* actually carries the PDF/A OutputIntent marker
 * Ghostscript is supposed to embed — not just that some PDF came back.
 */
test("guest can convert a real PDF to a best-effort PDF/A file", async ({ page }) => {
  await page.goto("/en/pdf-to-pdfa");
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

  const bytes = await readFile(downloadPath as string);
  const pdfDoc = await PDFDocument.load(bytes);
  expect(pdfDoc.getPageCount()).toBe(3);

  // The PDF/A OutputIntent dictionary declares this GTS_PDFA1 marker —
  // its presence proves Ghostscript actually embedded the output intent,
  // not just that -dPDFA=2 was passed without effect.
  expect(bytes.toString("latin1")).toContain("GTS_PDFA1");
});
