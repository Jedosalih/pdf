import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Extracts the first text line of every page in a PDF buffer, in document
 * order. Used to verify actual page *content* and *order* survived a
 * transformation (delete/extract/reorder) — a page-count check alone can't
 * tell a correctly-reordered document from an untouched one.
 *
 * Logs a harmless "standardFontDataUrl" warning to stderr — pdfjs-dist
 * wants that as a real URL (not a Windows path), and we only need text
 * extraction here, not font-accurate rendering, so it's not worth wiring
 * up for a test helper.
 */
export async function extractFirstLinePerPage(bytes: Buffer): Promise<string[]> {
  const doc = await getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
  }).promise;

  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    lines.push(text);
  }
  return lines;
}
