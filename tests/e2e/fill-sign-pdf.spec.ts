import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-with-form-field.pdf");
const FILL_VALUE = "Jane Doe";

/**
 * Real pipeline end to end against a PDF with a genuine AcroForm text field
 * (the same fixture flatten-pdf.spec.ts exercises): the field is detected
 * client-side via pdfjs-dist's annotation data, filled in and flattened
 * server-side via pdf-lib's form API, and a drawn signature is added on
 * top -- verified in the downloaded PDF's actual content (the filled
 * value via real text extraction, the signature via the PDF's own
 * drawing operator list), not just "a file came back."
 */
test("guest can fill a real form field and add a drawn signature", async ({ page }) => {
  await page.goto("/en/fill-sign-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(fixture);

  const overlay = page.getByTestId("editor-overlay");
  await overlay.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="editor-overlay"]');
    return !!el && el.getBoundingClientRect().width > 0;
  });
  // The "Detected N fillable fields" banner pushes the canvas further down
  // than a bare tool page -- scroll it fully into view so drag coordinates
  // below the field aren't computed against a viewport-clipped position.
  await overlay.scrollIntoViewIfNeeded();

  // The fixture's one real text field ("note") is detected and rendered
  // as a fillable input positioned over its actual location on the page.
  const fieldInput = page.getByTestId("sign-form-field");
  await expect(fieldInput).toHaveCount(1);
  await fieldInput.fill(FILL_VALUE);

  // Draw a signature clear of the field's box (the field sits roughly at
  // page-space y 130-160 on this 300pt-tall fixture).
  await page.getByRole("button", { name: "Draw signature" }).click();
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 185, { steps: 4 });
  await page.mouse.move(box.x + 180, box.y + 215, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-element")).toHaveCount(1);

  const exportButton = page.getByRole("button", { name: "Export PDF" });
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const bytes = await readFile(downloadPath as string);

  const pageTexts = await extractFirstLinePerPage(bytes);
  expect(pageTexts[0]).toContain("Flatten fixture");
  expect(pageTexts[0]).toContain(FILL_VALUE);

  const doc = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  const renderedPage = await doc.getPage(1);
  const opList = await renderedPage.getOperatorList();
  expect(opList.fnArray).toContain(OPS.constructPath);
});
