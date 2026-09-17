import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { diffLines, type Change } from "diff";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface CompareOptions {
  fileOrder?: string[];
}

const RESOLUTION_DPI = 100;
const MAX_VISUAL_COMPARE_PAGES = 30;
const MAX_TEXT_LENGTH = 2_000_000;
const PIXELMATCH_THRESHOLD = 0.1;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** pdftotext separates pages with a form-feed character by default -- the
 * trailing element after the last one is an artifact of that (a form feed
 * follows the last page too), not a real extra page. */
function splitIntoPages(text: string): string[] {
  const pages = text.split("\f");
  if (pages.length > 1 && pages[pages.length - 1] === "") pages.pop();
  return pages;
}

async function extractText(pdfPath: string, outputPath: string): Promise<string[]> {
  await runCommand("pdftotext", ["-layout", pdfPath, outputPath], { timeoutMs: 60_000 });
  const text = await readFile(outputPath, "utf8");
  return splitIntoPages(text.slice(0, MAX_TEXT_LENGTH));
}

function renderTextDiff(oldText: string, newText: string): string {
  const changes: Change[] = diffLines(oldText, newText);
  const rows: string[] = [];
  for (const change of changes) {
    const cls = change.added ? "added" : change.removed ? "removed" : "unchanged";
    const marker = change.added ? "+" : change.removed ? "-" : " ";
    const lines = change.value.split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
    for (const line of lines) {
      rows.push(`<div class="line ${cls}"><span class="marker">${marker}</span>${escapeHtml(line)}</div>`);
    }
  }
  return rows.join("\n");
}

/** Rasterizes every page of a document once (the same `pdftoppm -png -r
 * <dpi> <in> <prefix>` invocation, and the same `<prefix>-<N>.png` output
 * naming, already verified working in redactPdf.ts) rather than looping
 * per-page `-f`/`-l` calls -- one subprocess per document instead of one
 * per page, and no untested assumption about how poppler names output
 * files under a single-page `-f`/`-l` range. */
async function rasterizeAllPages(pdfPath: string, label: string, dir: string): Promise<Map<number, string>> {
  const outputDir = join(dir, `${label}-pages`);
  await mkdir(outputDir, { recursive: true });
  const outputPrefix = join(outputDir, "page");
  await runCommand("pdftoppm", ["-png", "-r", String(RESOLUTION_DPI), pdfPath, outputPrefix], {
    timeoutMs: 180_000,
    cwd: dir,
  });

  const entries = await readdir(outputDir);
  const byPage = new Map<number, string>();
  for (const name of entries) {
    const match = /^page-(\d+)\.png$/.exec(name);
    if (match) byPage.set(Number.parseInt(match[1]!, 10), join(outputDir, name));
  }
  return byPage;
}

async function pageCount(pdfPath: string): Promise<number> {
  const bytes = await readFile(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Compare, split honestly into the two different things it can mean
 * (blueprint requirement -- never conflate them):
 *
 * 1. Text differences: the full extracted text of each document (not
 *    per-page-aligned -- a page-index pairing would misreport an inserted/
 *    deleted page as changing every following page) diffed line-by-line
 *    with the well-established `diff` library.
 * 2. Visual differences: matching page-index pairs rendered at the same
 *    DPI and compared pixel-by-pixel with `pixelmatch`. This can surface
 *    differences a text diff misses entirely (font substitution, image
 *    edits, layout shifts) -- and, stated plainly in the report, can also
 *    flag *no* difference in cases a naive visual tool would (identical
 *    re-renders of identical text). Page pairs with mismatched raster
 *    dimensions are skipped and reported as such rather than guessed at.
 */
export async function handleComparePdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const options = (job.options as CompareOptions | null) ?? {};
  const order = options.fileOrder ?? job.inputFiles.map((file) => file.id);
  const filesById = new Map(job.inputFiles.map((file) => [file.id, file]));
  const orderedFiles = order
    .map((id) => filesById.get(id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  if (orderedFiles.length !== 2) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const [originalFile, revisedFile] = orderedFiles;
    const originalPath = join(dir, "original.pdf");
    const revisedPath = join(dir, "revised.pdf");
    await writeFile(originalPath, await downloadToBuffer(originalFile!.storageKey));
    await writeFile(revisedPath, await downloadToBuffer(revisedFile!.storageKey));

    let originalPages: number;
    let revisedPages: number;
    try {
      originalPages = await pageCount(originalPath);
      revisedPages = await pageCount(revisedPath);
    } catch {
      throw new JobFailure("UNSUPPORTED_FILE");
    }

    let originalTextPages: string[];
    let revisedTextPages: string[];
    try {
      originalTextPages = await extractText(originalPath, join(dir, "original.txt"));
      revisedTextPages = await extractText(revisedPath, join(dir, "revised.txt"));
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    // Joined with a real newline, not the "\f" page-separator pdftotext
    // itself uses -- diffLines splits on "\n" to determine lines, so a
    // literal "\f" here would glue the last line of one page to the first
    // line of the next into a single undiffable chunk with an invisible
    // control character embedded in the middle of the rendered text.
    const textDiffHtml = renderTextDiff(originalTextPages.join("\n"), revisedTextPages.join("\n"));

    const comparablePages = Math.min(originalPages, revisedPages, MAX_VISUAL_COMPARE_PAGES);
    const visualSections: string[] = [];

    let originalRasters: Map<number, string>;
    let revisedRasters: Map<number, string>;
    try {
      [originalRasters, revisedRasters] = await Promise.all([
        rasterizeAllPages(originalPath, "original", dir),
        rasterizeAllPages(revisedPath, "revised", dir),
      ]);
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    for (let pageNumber = 1; pageNumber <= comparablePages; pageNumber += 1) {
      try {
        const originalRasterPath = originalRasters.get(pageNumber);
        const revisedRasterPath = revisedRasters.get(pageNumber);
        if (!originalRasterPath || !revisedRasterPath) {
          visualSections.push(
            `<div class="page-diff"><h3>Page ${pageNumber}</h3><p class="note">Could not be rendered for comparison.</p></div>`,
          );
          continue;
        }
        const [originalPng, revisedPng] = await Promise.all([
          readFile(originalRasterPath),
          readFile(revisedRasterPath),
        ]);
        const originalRaw = await sharp(originalPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const revisedRaw = await sharp(revisedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        if (
          originalRaw.info.width !== revisedRaw.info.width ||
          originalRaw.info.height !== revisedRaw.info.height
        ) {
          visualSections.push(
            `<div class="page-diff"><h3>Page ${pageNumber}</h3><p class="note">Skipped -- the two pages render at different sizes (${originalRaw.info.width}×${originalRaw.info.height} vs ${revisedRaw.info.width}×${revisedRaw.info.height}), so a pixel-by-pixel comparison isn't meaningful.</p></div>`,
          );
          continue;
        }

        const { width, height } = originalRaw.info;
        const diffRaw = Buffer.alloc(width * height * 4);
        const diffPixelCount = pixelmatch(
          originalRaw.data,
          revisedRaw.data,
          diffRaw,
          width,
          height,
          { threshold: PIXELMATCH_THRESHOLD },
        );
        const totalPixels = width * height;
        const percent = ((diffPixelCount / totalPixels) * 100).toFixed(2);

        if (diffPixelCount === 0) {
          visualSections.push(
            `<div class="page-diff"><h3>Page ${pageNumber}</h3><p class="note">No visual difference.</p></div>`,
          );
          continue;
        }

        const diffPng = await sharp(diffRaw, { raw: { width, height, channels: 4 } }).png().toBuffer();
        visualSections.push(
          `<div class="page-diff"><h3>Page ${pageNumber} -- ${diffPixelCount.toLocaleString(
            "en-US",
          )} pixels differ (${percent}%)</h3><img src="data:image/png;base64,${diffPng.toString("base64")}" alt="Visual diff for page ${pageNumber}"></div>`,
        );
      } catch {
        visualSections.push(
          `<div class="page-diff"><h3>Page ${pageNumber}</h3><p class="note">Could not be compared visually.</p></div>`,
        );
      }
    }

    const extraPagesNote =
      originalPages !== revisedPages
        ? `<p class="note">"${escapeHtml(originalFile!.originalName)}" has ${originalPages} page(s); "${escapeHtml(
            revisedFile!.originalName,
          )}" has ${revisedPages} page(s). Only the first ${comparablePages} page(s) present in both were compared visually.</p>`
        : "";

    const html = buildReportHtml({
      originalName: originalFile!.originalName,
      revisedName: revisedFile!.originalName,
      originalPages,
      revisedPages,
      textDiffHtml,
      extraPagesNote,
      visualSections: visualSections.join("\n"),
    });

    const outputBuffer = Buffer.from(html, "utf8");
    const storageKey = `results/${randomUUID()}.html`;
    await uploadBuffer(storageKey, outputBuffer, "text/html");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "comparison-report.html",
        mimeType: "text/html",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}

function buildReportHtml(params: {
  originalName: string;
  revisedName: string;
  originalPages: number;
  revisedPages: number;
  textDiffHtml: string;
  extraPagesNote: string;
  visualSections: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDF Comparison Report</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #0f172a; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.25rem; margin-top: 2.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }
  h3 { font-size: 1rem; margin-bottom: 0.25rem; }
  .meta { color: #64748b; }
  .note { color: #64748b; font-style: italic; }
  pre.diff { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; overflow-x: auto; }
  .line { padding: 0 0.25rem; }
  .line .marker { display: inline-block; width: 1.25em; color: #94a3b8; }
  .line.added { background: #dcfce7; }
  .line.removed { background: #fee2e2; text-decoration: line-through; text-decoration-color: #fca5a5; }
  .page-diff { margin-bottom: 1.5rem; }
  .page-diff img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; }
</style>
</head>
<body>
  <h1>PDF Comparison Report</h1>
  <p class="meta">Original: <strong>${escapeHtml(params.originalName)}</strong> (${params.originalPages} page(s)) &nbsp;vs.&nbsp; Revised: <strong>${escapeHtml(params.revisedName)}</strong> (${params.revisedPages} page(s))</p>

  <h2>Text differences</h2>
  <p class="meta">The full extracted text of each document, compared as a whole (not aligned page-by-page, since an inserted or deleted page would otherwise misreport every following page as changed). Green is text only in the revised file, red/struck-through is text only in the original.</p>
  <pre class="diff">${params.textDiffHtml}</pre>

  <h2>Visual differences</h2>
  <p class="meta">Each page is rendered to an image and compared pixel by pixel. This can catch differences a text diff can't see at all -- font substitutions, image edits, layout shifts -- and is a genuinely separate comparison from the text diff above, not a restatement of it.</p>
  ${params.extraPagesNote}
  ${params.visualSections}
</body>
</html>
`;
}
