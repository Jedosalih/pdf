import { randomUUID } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface Line {
  text: string;
  fontSize: number;
  y: number;
  cells: string[];
}

const WORD_GAP_RATIO = 0.2;
const CELL_GAP_RATIO = 2.5;
const LINE_Y_TOLERANCE_RATIO = 0.35;
const HEADING_SIZE_RATIO = 1.15;
const MAX_HEADING_CHARS = 150;
const MIN_TABLE_ROWS = 3;
const MAX_TABLE_COLS = 10;

/**
 * `\`, backtick, `*`, `_`, braces/brackets, `<`/`>`, and `|` all have
 * special meaning in Markdown -- escaping them in *extracted* text (never
 * in text this module generates itself, like a heading `#` or a `- `
 * bullet) prevents a source PDF's own literal characters from being
 * misread as formatting by a Markdown renderer.
 */
function escapeMarkdownText(text: string): string {
  let escaped = text.replace(/[\\`*_{}[\]<>|]/g, (ch) => `\\${ch}`);
  if (/^[#>]/.test(escaped)) {
    escaped = `\\${escaped}`;
  }
  return escaped;
}

/** Groups one page's raw text items into text lines using Y-position
 * clustering (primary signal) plus pdf.js's own `hasEOL` flag (secondary
 * signal) -- geometric clustering alone is robust to PDFs where `hasEOL`
 * is unreliable, but combining both catches more real line breaks than
 * either alone. Within a line, items are joined by inspecting the actual
 * horizontal gap to the next item: a small gap means "same word split
 * across a font/style change" (no separator), a normal gap is a word
 * boundary (single space), and a large gap is a candidate table-column
 * boundary (recorded as a separate cell). */
function groupItemsIntoLines(
  items: { str: string; transform: number[]; width: number; hasEOL: boolean }[],
): Line[] {
  const lines: Line[] = [];
  let cellRuns: { text: string; endX: number }[][] = [];
  let currentCell: { text: string; endX: number }[] = [];
  let lineY: number | null = null;
  let lineFontSize = 0;
  let prevEndX: number | null = null;
  let prevHadEOL = false;

  const flushLine = () => {
    if (currentCell.length > 0) cellRuns.push(currentCell);
    if (cellRuns.length === 0) return;
    const cells = cellRuns.map((run) => run.map((r) => r.text).join(""));
    lines.push({
      text: cells.join("  "),
      fontSize: lineFontSize,
      y: lineY ?? 0,
      cells,
    });
    cellRuns = [];
    currentCell = [];
  };

  for (const item of items) {
    const str = item.str;
    const isWhitespaceOnly = str.trim().length === 0;
    const fontSize = Math.hypot(item.transform[0]!, item.transform[1]!) || 1;
    const x = item.transform[4]!;
    const y = item.transform[5]!;

    // pdf.js synthesizes a pure-whitespace item (empty or single space)
    // spanning exactly the gap between two real text runs when the
    // content stream jumps position without emitting glyphs -- verified
    // empirically, not assumed. Deliberately leave `prevEndX` untouched
    // here (still pointing at the end of the last *real* item): the next
    // real item's own gap computation (`x - prevEndX`) then naturally
    // measures the true on-page distance spanning this whitespace item,
    // which is the actual column/word-gap signal. Updating `prevEndX` to
    // this item's own end would collapse that distance to ~0 for the
    // very next item, silently erasing the gap the whole table/word-
    // boundary heuristic depends on.
    if (isWhitespaceOnly && !item.hasEOL) {
      continue;
    }

    const isNewLine =
      lineY === null ||
      Math.abs(y - lineY) > LINE_Y_TOLERANCE_RATIO * Math.max(fontSize, lineFontSize) ||
      prevHadEOL;

    if (isNewLine) {
      flushLine();
      lineY = y;
      lineFontSize = fontSize;
      prevEndX = null;
    } else if (fontSize > lineFontSize) {
      lineFontSize = fontSize;
    }

    const gap = prevEndX === null ? 0 : x - prevEndX;
    if (prevEndX !== null && gap > CELL_GAP_RATIO * fontSize && currentCell.length > 0) {
      cellRuns.push(currentCell);
      currentCell = [];
      if (cellRuns.length >= MAX_TABLE_COLS) {
        // Pathological over-splitting guard -- stop creating new cells,
        // append everything else to the last one instead.
        currentCell = cellRuns.pop()!;
      }
    } else if (prevEndX !== null && gap > WORD_GAP_RATIO * fontSize) {
      currentCell.push({ text: " ", endX: x });
    }

    currentCell.push({ text: str, endX: x + item.width });
    prevEndX = x + item.width;
    prevHadEOL = item.hasEOL;
  }
  flushLine();

  return lines.filter((line) => line.text.trim().length > 0);
}

function detectListPrefix(text: string): { marker: string; rest: string } | null {
  const bulletMatch = /^[•▪◦‣·]\s*(.*)$/.exec(text);
  if (bulletMatch) return { marker: "- ", rest: bulletMatch[1]! };
  const dashMatch = /^[-*]\s+(.*)$/.exec(text);
  if (dashMatch) return { marker: "- ", rest: dashMatch[1]! };
  const numberedMatch = /^(\d+)[.)]\s+(.*)$/.exec(text);
  if (numberedMatch) return { marker: `${numberedMatch[1]}. `, rest: numberedMatch[2]! };
  const letteredMatch = /^[a-hA-H][.)]\s+(.*)$/.exec(text);
  if (letteredMatch) return { marker: "- ", rest: letteredMatch[1]! };
  return null;
}

/**
 * Converts one page's already-grouped lines into Markdown blocks.
 * `bodySize` (the document-wide modal font size) and `headingSizes`
 * (distinct sizes above it, ranked descending) are computed once across
 * the whole document so heading levels stay consistent across pages.
 */
interface Block {
  text: string;
  /** Consecutive list-item blocks join with a single newline (a "tight"
   * Markdown list); every other adjacent pair joins with a blank line. */
  isListItem: boolean;
}

function renderPageMarkdown(lines: Line[], bodySize: number, headingSizes: number[]): Block[] {
  const blocks: Block[] = [];
  let paragraphBuffer: string[] = [];
  let tableBuffer: string[][] = [];
  let prevY: number | null = null;
  let modalGap = 0;

  const gaps = lines
    .slice(1)
    .map((line, i) => Math.abs(lines[i]!.y - line.y))
    .filter((g) => g > 0.1);
  if (gaps.length > 0) {
    const counts = new Map<number, number>();
    for (const g of gaps) {
      const rounded = Math.round(g * 2) / 2;
      counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
    }
    modalGap = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      blocks.push({ text: paragraphBuffer.join(" "), isListItem: false });
      paragraphBuffer = [];
    }
  };
  const flushTable = () => {
    if (tableBuffer.length >= MIN_TABLE_ROWS) {
      const colCount = tableBuffer[0]!.length;
      const header = `| ${tableBuffer[0]!.join(" | ")} |`;
      const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;
      const rows = tableBuffer
        .slice(1)
        .map((row) => `| ${row.join(" | ")} |`);
      blocks.push({ text: [header, separator, ...rows].join("\n"), isListItem: false });
    } else if (tableBuffer.length > 0) {
      // Didn't reach the confidence threshold for a real table -- fall
      // back to preserving each row as its own line rather than
      // fabricating a table structure from a weak signal.
      for (const row of tableBuffer) blocks.push({ text: row.join("  "), isListItem: false });
    }
    tableBuffer = [];
  };

  for (const line of lines) {
    const isMultiCell = line.cells.length >= 2 && line.cells.length <= MAX_TABLE_COLS;
    const matchesPendingTable =
      tableBuffer.length === 0 || tableBuffer[0]!.length === line.cells.length;

    if (isMultiCell && matchesPendingTable) {
      flushParagraph();
      tableBuffer.push(line.cells.map((c) => escapeMarkdownText(c.trim())));
      prevY = line.y;
      continue;
    }
    flushTable();

    const isHeading =
      line.fontSize > bodySize * HEADING_SIZE_RATIO && line.text.length <= MAX_HEADING_CHARS;
    if (isHeading) {
      flushParagraph();
      const level = Math.min(headingSizes.indexOf(line.fontSize) + 1 || 3, 3);
      blocks.push({
        text: `${"#".repeat(level)} ${escapeMarkdownText(line.text.trim())}`,
        isListItem: false,
      });
      prevY = line.y;
      continue;
    }

    const list = detectListPrefix(line.text.trim());
    if (list) {
      flushParagraph();
      blocks.push({
        text: `${list.marker}${escapeMarkdownText(list.rest)}`,
        isListItem: true,
      });
      prevY = line.y;
      continue;
    }

    const gapFromPrev = prevY === null ? 0 : Math.abs(prevY - line.y);
    if (prevY !== null && modalGap > 0 && gapFromPrev > modalGap * 1.6) {
      flushParagraph();
    }
    paragraphBuffer.push(escapeMarkdownText(line.text.trim()));
    prevY = line.y;
  }
  flushTable();
  flushParagraph();

  return blocks;
}

function joinBlocks(blocks: Block[]): string {
  let result = "";
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (i > 0) {
      const prev = blocks[i - 1]!;
      result += prev.isListItem && block.isListItem ? "\n" : "\n\n";
    }
    result += block.text;
  }
  return result;
}

/**
 * Heuristic, not a real layout-analysis engine: font-size ranking for
 * headings, prefix matching for lists, horizontal-gap clustering for
 * tables (>= 3 consecutive same-column-count rows only -- a single
 * oddly-spaced line never becomes a fabricated one-row table), and
 * vertical-gap comparison for paragraph breaks. Explicitly does not
 * detect bold/italic emphasis (pdf.js's per-item `fontName` is an
 * internal resource alias, not a reliable weight signal without deeper
 * font-descriptor inspection) and does not merge/span table cells.
 * Genuinely useful structure for normally-authored PDFs, not a claim of
 * pixel-perfect or fully-general layout reconstruction -- see
 * docs/DECISIONS.md.
 */
export async function handlePdfToMarkdown(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async () => {
    const buffer = await downloadToBuffer(inputFile.storageKey);

    let doc;
    try {
      doc = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const pageLines: Line[][] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => "str" in item) as unknown as {
        str: string;
        transform: number[];
        width: number;
        hasEOL: boolean;
      }[];
      pageLines.push(groupItemsIntoLines(items));
    }

    const sizeCounts = new Map<number, number>();
    for (const lines of pageLines) {
      for (const line of lines) {
        if (line.cells.length >= 2) continue;
        const rounded = Math.round(line.fontSize * 2) / 2;
        sizeCounts.set(rounded, (sizeCounts.get(rounded) ?? 0) + 1);
      }
    }
    const bodySize =
      [...sizeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;
    const headingSizes = [...sizeCounts.keys()]
      .filter((size) => size > bodySize * HEADING_SIZE_RATIO)
      .sort((a, b) => b - a);

    const sections: string[] = [];
    let anyExtractableText = false;
    for (let i = 0; i < pageLines.length; i += 1) {
      const lines = pageLines[i]!;
      if (lines.length === 0) {
        sections.push(
          `_[Page ${i + 1} has no extractable text -- it appears to be a scanned or ` +
            `image-only page. Run it through the OCR PDF tool first, then convert the ` +
            `result to get real text for this page.]_`,
        );
        continue;
      }
      anyExtractableText = true;
      const blocks = renderPageMarkdown(lines, bodySize, headingSizes);
      sections.push(joinBlocks(blocks));
    }

    if (!anyExtractableText) {
      throw new JobFailure("NO_EXTRACTABLE_TEXT");
    }

    const markdown = sections.join("\n\n");
    const outputBuffer = Buffer.from(markdown, "utf-8");
    const storageKey = `results/${randomUUID()}.md`;
    await uploadBuffer(storageKey, outputBuffer, "text/markdown");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.md",
        mimeType: "text/markdown",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
