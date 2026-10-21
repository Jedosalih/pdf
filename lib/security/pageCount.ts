import { PDFDocument } from "pdf-lib";

export type PageCountResult =
  | { ok: true; pages: number }
  | { ok: false; reason: "ENCRYPTED" | "UNREADABLE" };

/**
 * Counts a PDF's pages for the `maxPages` gate at job creation. Fails
 * closed: a file whose pages can't be counted reports `ok: false` instead
 * of a guessed count.
 *
 * pdf-lib, not pdf.js: inside the Next.js server bundle pdf.js can't load
 * its worker module ("Setting up fake worker failed"), so every count
 * threw -- and the previous code turned that into "0 pages", which means
 * `maxPages` was never actually enforced at runtime (found 2026-10-21,
 * docs/DECISIONS.md). pdf-lib is pure JS with no worker. With
 * `ignoreEncryption` it still reads the page tree of an encrypted file
 * whenever that tree isn't inside an encrypted object stream (PDF
 * encryption covers strings and streams, not dictionaries).
 */
export async function countPdfPages(buffer: Buffer): Promise<PageCountResult> {
  try {
    const doc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const pages = doc.getPageCount();
    if (pages > 0) return { ok: true, pages };
    return { ok: false, reason: doc.isEncrypted ? "ENCRYPTED" : "UNREADABLE" };
  } catch {
    // Only chooses the error message the user sees; either way the file
    // is refused (or, for deferPageLimitToWorker tools, checked later).
    return { ok: false, reason: looksEncrypted(buffer) ? "ENCRYPTED" : "UNREADABLE" };
  }
}

function looksEncrypted(buffer: Buffer): boolean {
  const tail = buffer.subarray(Math.max(0, buffer.length - 64 * 1024)).toString("latin1");
  return tail.includes("/Encrypt");
}
