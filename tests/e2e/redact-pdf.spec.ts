import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { containsPdfString, decodedPdfText } from "./helpers/pdfBytes";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end, proving genuine content removal rather than a
 * drawn box over intact text: redact a region of page 1 only, export, and
 * verify the downloaded PDF's actual content -- page 1 has *zero*
 * extractable text left anywhere on the page (not just under the box) and
 * carries an embedded raster image (proof it was rasterized and replaced),
 * while pages 2 and 3 -- never touched -- keep their exact original
 * extractable text and are NOT rasterized. A fake "black rectangle on top"
 * implementation would still let page 1's text extract cleanly; this
 * would fail that the moment it ran.
 */
test("guest can redact a region of a page and the underlying text is genuinely gone", async ({
  page,
}) => {
  await page.goto("/en/redact-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(fixture);

  const overlay = page.getByTestId("editor-overlay");
  await overlay.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="editor-overlay"]');
    return !!el && el.getBoundingClientRect().width > 0;
  });
  await overlay.scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "Redact" }).click();
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 120, { steps: 5 });
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

  const doc = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  expect(doc.numPages).toBe(3);

  const redactedPage = await doc.getPage(1);
  const redactedText = (await redactedPage.getTextContent()).items
    .map((item) => ("str" in item ? item.str : ""))
    .join("")
    .trim();
  expect(redactedText).toBe("");
  const redactedOps = await redactedPage.getOperatorList();
  expect(redactedOps.fnArray).toContain(OPS.paintImageXObject);

  for (const pageNumber of [2, 3]) {
    const untouchedPage = await doc.getPage(pageNumber);
    const text = (await untouchedPage.getTextContent()).items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    expect(text).toContain(`Fixture-B - page ${pageNumber}`);
    const ops = await untouchedPage.getOperatorList();
    expect(ops.fnArray).not.toContain(OPS.paintImageXObject);
  }

  // Regression for the original bug: page 1's text extracted as "" even
  // then, while its content stream was still serialized in the file as an
  // unreferenced object. Check the bytes, not just the page.
  const decoded = decodedPdfText(bytes);
  expect(containsPdfString(decoded, "Fixture-B - page 1")).toBe(false);
  expect(containsPdfString(decoded, "Fixture-B - page 2")).toBe(true);
});

/**
 * Same UI path, with a fixture that hides a unique marker in every place a
 * PDF can keep data the page doesn't visibly draw. None of them may
 * survive anywhere in the exported bytes; the untouched page's text must.
 * The exhaustive version (rotated/cropped pages, shared resources, hidden
 * annotations, encrypted input) runs inside the worker image:
 * workers/pdf/src/redaction.test.ts.
 */
test("redaction leaves no recoverable copy of page content, form values, metadata or attachments", async ({
  page,
}) => {
  const fixture = await PDFDocument.create();
  fixture.setTitle("MARKER-E2E-TITLE");
  fixture.setAuthor("MARKER-E2E-AUTHOR");
  const font = await fixture.embedFont(StandardFonts.Helvetica);
  const first = fixture.addPage([600, 800]);
  first.drawText("MARKER-E2E-SECRET", { x: 50, y: 700, size: 20, font });
  const field = fixture.getForm().createTextField("secret");
  field.setText("MARKER-E2E-FIELD");
  field.addToPage(first, { x: 50, y: 600, width: 250, height: 24 });
  fixture.addPage([600, 800]).drawText("MARKER-E2E-KEEP", { x: 50, y: 700, size: 20, font });
  await fixture.attach(Buffer.from("MARKER-E2E-ATTACHMENT"), "secret.txt", { mimeType: "text/plain" });
  const buffer = Buffer.from(await fixture.save());

  const sourceText = decodedPdfText(buffer);
  for (const marker of ["MARKER-E2E-TITLE", "MARKER-E2E-SECRET", "MARKER-E2E-FIELD", "MARKER-E2E-ATTACHMENT"]) {
    expect(containsPdfString(sourceText, marker), `fixture should contain ${marker}`).toBe(true);
  }

  await page.goto("/en/redact-pdf");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "markers.pdf", mimeType: "application/pdf", buffer });

  const overlay = page.getByTestId("editor-overlay");
  await overlay.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="editor-overlay"]');
    return !!el && el.getBoundingClientRect().width > 0;
  });
  await overlay.scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "Redact" }).click();
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height * 0.4, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-element")).toHaveCount(1);

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const bytes = await readFile((await download.path()) as string);

  const decoded = decodedPdfText(bytes);
  for (const marker of [
    "MARKER-E2E-TITLE",
    "MARKER-E2E-AUTHOR",
    "MARKER-E2E-SECRET",
    "MARKER-E2E-FIELD",
    "MARKER-E2E-ATTACHMENT",
  ]) {
    expect(containsPdfString(decoded, marker), `${marker} survived redaction`).toBe(false);
  }
  expect(containsPdfString(decoded, "MARKER-E2E-KEEP")).toBe(true);
  for (const key of ["/AcroForm", "/EmbeddedFile", "/Widget"]) {
    expect(decoded.includes(key), `${key} survived redaction`).toBe(false);
  }

  const doc = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  expect(doc.numPages).toBe(2);
  const keptText = (await (await doc.getPage(2)).getTextContent()).items
    .map((item) => ("str" in item ? item.str : ""))
    .join("");
  expect(keptText).toContain("MARKER-E2E-KEEP");
  const info = (await doc.getMetadata()).info as Record<string, unknown>;
  expect(info.Title).toBeUndefined();
  expect(info.Author).toBeUndefined();
});

/**
 * On a phone the page-thumbnail sidebar is hidden; before 2026-10-21 there
 * was then no way to reach page 2+ at all. The pager must work, and the
 * initial zoom must fit the page to the screen.
 */
test("on a phone, a later page can be reached and redacted", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/redact-pdf");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);

  const overlay = page.getByTestId("editor-overlay");
  await overlay.waitFor({ timeout: 20_000 });
  const pager = page.getByTestId("editor-page-nav");
  await expect(pager).toContainText("Page 1 of 3");
  const firstBox = (await overlay.boundingBox())!;
  expect(firstBox.width).toBeLessThanOrEqual(375);

  await pager.getByRole("button", { name: "Next page" }).click();
  await expect(pager).toContainText("Page 2 of 3");

  await page.getByRole("button", { name: "Redact" }).click();
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-element")).toHaveCount(1);

  await page.getByRole("button", { name: "Export PDF" }).click();
  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const bytes = await readFile((await download.path()) as string);

  const doc = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  const textOf = async (n: number) =>
    (await (await doc.getPage(n)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("");
  expect(await textOf(1)).toContain("Fixture-B - page 1");
  expect(await textOf(2)).toBe("");
  expect(containsPdfString(decodedPdfText(bytes), "Fixture-B - page 2")).toBe(false);
});
