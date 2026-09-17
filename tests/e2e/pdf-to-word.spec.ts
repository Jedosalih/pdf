import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end. Requires the empirically-verified
 * `writer_pdf_import` infilter + explicit "MS Word 2007 XML" filter
 * (see docs/DECISIONS.md) — without them, LibreOffice can't export a
 * PDF to docx at all. Verifies actual paragraph text survived by reading
 * word/document.xml directly, not just that a .docx file came back.
 */
test("guest can convert a real PDF to an editable Word document", async ({ page }) => {
  await page.goto("/en/pdf-to-word");
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
  const documentXml = await zip.file("word/document.xml")?.async("string");
  expect(documentXml).toBeDefined();
  expect(documentXml).toContain("Fixture-B - page 1");
  expect(documentXml).toContain("Fixture-B - page 2");
  expect(documentXml).toContain("Fixture-B - page 3");
});
