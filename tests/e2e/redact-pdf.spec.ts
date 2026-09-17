import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

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
});
