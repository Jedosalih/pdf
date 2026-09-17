import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const imageFixture = path.join(__dirname, "../../docs/fixtures/sample-graphic.png");
const TEXT_MARKER = "EditPdfTextMarker12345";

/**
 * Real pipeline end to end: upload a PDF, use the interactive canvas editor
 * to add a text box, an image, and a rectangle, exercise undo/redo, export,
 * and verify the downloaded PDF actually contains the added text (via real
 * text extraction) and the added image/shape (via the PDF's own drawing
 * operator list) -- not just that a file came back.
 */
test("guest can add text, an image, and a shape to a real PDF and export it", async ({ page }) => {
  await page.goto("/en/edit-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(fixture);

  const overlay = page.getByTestId("editor-overlay");
  await overlay.waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="editor-overlay"]');
    return !!el && el.getBoundingClientRect().width > 0;
  });
  const box = (await overlay.boundingBox())!;

  // Add a text box.
  await page.getByRole("button", { name: "Add text" }).click();
  await page.mouse.click(box.x + 60, box.y + 60);
  await page.getByTestId("editor-text-input").fill(TEXT_MARKER);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("editor-text-input")).toHaveCount(0);
  await expect(page.getByTestId("editor-element")).toHaveCount(1);

  // Add an image -- the picker is a hidden <input>, set directly rather
  // than driving a native file-chooser dialog.
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg"]')
    .setInputFiles(imageFixture);
  await expect(page.getByTestId("editor-element")).toHaveCount(2);

  // Draw a rectangle by dragging on empty canvas space, clear of the text
  // box (60,60)-(260,90) and the image's default (72,72)-(272,222). The
  // properties panel that appears once an element is selected narrows the
  // flex-centered canvas area and shifts its on-screen position, so the
  // bounding box is re-read here rather than reusing the one captured
  // before anything was selected.
  await page.getByRole("button", { name: "Rectangle" }).click();
  const rectBox = (await overlay.boundingBox())!;
  await page.mouse.move(rectBox.x + 300, rectBox.y + 240);
  await page.mouse.down();
  await page.mouse.move(rectBox.x + 370, rectBox.y + 280, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("editor-element")).toHaveCount(3);

  // Undo removes the rectangle; redo brings it back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("editor-element")).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByTestId("editor-element")).toHaveCount(3);

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
  expect(pageTexts[0]).toContain(TEXT_MARKER);

  const doc = await getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false }).promise;
  expect(doc.numPages).toBe(2);
  const renderedPage = await doc.getPage(1);
  const opList = await renderedPage.getOperatorList();
  expect(opList.fnArray).toContain(OPS.paintImageXObject);
  expect(opList.fnArray).toContain(OPS.constructPath);
});
