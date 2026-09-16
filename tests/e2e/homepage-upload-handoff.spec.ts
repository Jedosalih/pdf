import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const pdfFixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const jpgFixture = path.join(__dirname, "../../docs/fixtures/sample-photo.jpg");

/**
 * The homepage's hero dropzone -> tool picker -> handoff mechanism
 * (PendingUploadProvider): a file dropped before any tool is chosen must
 * survive the client-side navigation into the chosen tool's page without
 * being re-selected, then drive the real pipeline to a valid result.
 */
test("dropping a PDF offers only PDF-capable tools, and the file survives the handoff to the chosen tool", async ({
  page,
}) => {
  await page.goto("/en");
  await page.locator('input[type="file"]').first().setInputFiles(pdfFixture);

  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await expect(picker.getByText("Compress PDF")).toBeVisible();
  await expect(picker.getByText("Merge PDF files")).toBeVisible();
  // Image-only tools must not be offered for a PDF.
  await expect(picker.getByText("JPG to PDF")).toHaveCount(0);
  await expect(picker.getByText("PNG to PDF")).toHaveCount(0);

  // Selecting a tool must be a client-side navigation (no full reload) for
  // the in-memory File handoff to survive.
  await picker.getByRole("button", { name: /Compress PDF/i }).click();
  await page.waitForURL("**/compress-pdf");

  // The file must already be present without re-selecting it.
  await expect(page.getByText("sample-a-2page.pdf")).toBeVisible();
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const bytes = await readFile(downloadPath as string);
  const result = await PDFDocument.load(bytes);
  expect(result.getPageCount()).toBe(2);
});

test("dropping an image offers only image-capable tools", async ({ page }) => {
  await page.goto("/en");
  await page.locator('input[type="file"]').first().setInputFiles(jpgFixture);

  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();
  await expect(picker.getByText("JPG to PDF")).toBeVisible();
  await expect(picker.getByText("Compress PDF")).toHaveCount(0);
  await expect(picker.getByText("Merge PDF files")).toHaveCount(0);
});

test("dropping an unsupported file type shows an inline warning and no picker", async ({
  page,
}) => {
  await page.goto("/en");
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "resume.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("not a real docx, just bytes for the type check"),
  });

  await expect(
    page.getByText("We don't have a tool for this file type yet."),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
