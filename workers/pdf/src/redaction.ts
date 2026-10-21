import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { runCommand, runCommandCaptureAll } from "./exec.js";
import { runPureCompute } from "./runPureCompute.js";
import { JobFailure } from "./errors.js";

export const REDACTION_DPI = 150;
const MAX_BOXES = 300;
const MAX_DIMENSION = 20_000;

/** A box in the coordinate space the client draws in: pdf.js's viewport at
 * scale 1 -- PDF points, top-left origin, CropBox-relative, with the
 * page's /Rotate already applied. pdftoppm's `-cropbox` raster below is in
 * exactly the same space (times REDACTION_DPI / 72). */
export interface RedactionBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Drops anything malformed; page-range checks happen once the real page
 * count is known (`redactPdfFile`). */
export function parseRedactionBoxes(raw: unknown): RedactionBox[] {
  if (!Array.isArray(raw)) return [];
  const boxes: RedactionBox[] = [];
  for (const item of raw.slice(0, MAX_BOXES)) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const page = num(b.page);
    const x = num(b.x);
    const y = num(b.y);
    const width = num(b.width);
    const height = num(b.height);
    if (page === null || !Number.isInteger(page) || page < 0) continue;
    if (x === null || y === null || width === null || height === null) continue;
    if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) continue;
    boxes.push({ page, x, y, width, height });
  }
  return boxes;
}

async function burnBoxes(pngPath: string, boxes: RedactionBox[]): Promise<boolean> {
  const raw = await readFile(pngPath);
  const { width: imageWidth, height: imageHeight } = await sharp(raw).metadata();
  if (!imageWidth || !imageHeight) return false;

  const scale = REDACTION_DPI / 72;
  const rects = boxes
    .map((box) => {
      const x0 = Math.max(0, Math.floor(box.x * scale));
      const y0 = Math.max(0, Math.floor(box.y * scale));
      const x1 = Math.min(imageWidth, Math.ceil((box.x + box.width) * scale));
      const y1 = Math.min(imageHeight, Math.ceil((box.y + box.height) * scale));
      if (x1 <= x0 || y1 <= y0) return "";
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="black"/>`;
    })
    .filter(Boolean);
  // Every box on this page fell outside the visible area -- refuse rather
  // than hand back a page the user believes is redacted.
  if (rects.length === 0) return false;

  const svg = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">${rects.join("")}</svg>`;
  const burned = await sharp(raw).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await writeFile(pngPath, burned);
  return true;
}

/**
 * The whole redaction pipeline, independent of the job/DB layer so it can
 * be exercised directly (src/redaction.test.ts):
 *
 * 1. Refuse encrypted input and input qpdf cannot parse at all -- the
 *    pipeline can only promise removal for structure it can fully read.
 * 2. qpdf `--flatten-annotations=all` (+ generated appearances) bakes
 *    visible form values and annotations into page content, so the raster
 *    of a redacted page shows exactly what the user saw in the editor,
 *    and the interactive copies of that data are gone.
 * 3. pdftoppm `-cropbox` rasterizes each redacted page in the same
 *    coordinate space the client used; the boxes are burned into pixels.
 * 4. `redactAssemble` (an isolated, killable subprocess) builds a brand
 *    new document: raster-only pages for redacted pages, copied untouched
 *    pages, and none of the source's document-level structures.
 * 5. qpdf rebuilds the result from its pages (`--empty --pages`): only
 *    objects reachable from those pages are written (dropping anything
 *    `copyPages` pulled in that is no longer referenced) and resources an
 *    untouched page doesn't use are removed, so a resource dictionary
 *    shared with a redacted page can't smuggle that page's XObjects back
 *    in (a real case the regression test covers).
 */
export async function redactPdfFile(inputPath: string, boxes: RedactionBox[], dir: string): Promise<Buffer> {
  const encryption = await runCommandCaptureAll("qpdf", ["--is-encrypted", inputPath], { timeoutMs: 30_000, cwd: dir });
  if (encryption.exitCode === 0) throw new JobFailure("ENCRYPTED_PDF");
  if (encryption.exitCode !== 2) throw new JobFailure("UNSUPPORTED_FILE");

  const check = await runCommandCaptureAll("qpdf", ["--check", inputPath], { timeoutMs: 60_000, cwd: dir });
  if (check.exitCode !== 0 && check.exitCode !== 3) throw new JobFailure("UNSUPPORTED_FILE");

  const flatPath = join(dir, "flattened.pdf");
  const flatten = await runCommandCaptureAll(
    "qpdf",
    ["--generate-appearances", "--flatten-annotations=all", inputPath, flatPath],
    { timeoutMs: 120_000, cwd: dir },
  );
  if (flatten.exitCode !== 0 && flatten.exitCode !== 3) throw new JobFailure("UNSUPPORTED_FILE");

  const pageCount = await countPages(flatPath, dir);
  const boxesByPage = new Map<number, RedactionBox[]>();
  for (const box of boxes) {
    if (box.page >= pageCount) continue;
    boxesByPage.set(box.page, [...(boxesByPage.get(box.page) ?? []), box]);
  }
  if (boxesByPage.size === 0) throw new JobFailure("VALIDATION_ERROR");

  const redactedPages = [...boxesByPage.keys()].sort((a, b) => a - b);
  const rasterPaths: string[] = [];
  for (const pageIndex of redactedPages) {
    const prefix = join(dir, `redacted-${pageIndex}`);
    const pageNumber = String(pageIndex + 1);
    try {
      await runCommand(
        "pdftoppm",
        ["-png", "-r", String(REDACTION_DPI), "-cropbox", "-f", pageNumber, "-l", pageNumber, "-singlefile", flatPath, prefix],
        { timeoutMs: 120_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }
    const pngPath = `${prefix}.png`;
    if (!(await burnBoxes(pngPath, boxesByPage.get(pageIndex)!))) throw new JobFailure("VALIDATION_ERROR");
    rasterPaths.push(pngPath);
  }

  const assembled = await runPureCompute(
    "redactAssemble",
    [
      { buffer: await readFile(flatPath), mimeType: "application/pdf" },
      ...(await Promise.all(rasterPaths.map(async (path) => ({ buffer: await readFile(path), mimeType: "image/png" })))),
    ],
    { redactedPages, dpi: REDACTION_DPI },
    dir,
    120_000,
  );
  const assembledPath = join(dir, "assembled.pdf");
  await writeFile(assembledPath, assembled);

  // `--empty --pages` rebuilds a document from the pages alone: only
  // objects reachable from those pages are written, and (verified against
  // qpdf 11.3 -- a plain rewrite does NOT do this) resources a page lists
  // but its content never uses are dropped.
  const finalPath = join(dir, "redacted.pdf");
  const rewrite = await runCommandCaptureAll(
    "qpdf",
    [
      "--remove-unreferenced-resources=yes",
      "--compress-streams=y",
      "--object-streams=disable",
      "--empty",
      "--pages",
      assembledPath,
      "--",
      finalPath,
    ],
    { timeoutMs: 120_000, cwd: dir },
  );
  if (rewrite.exitCode !== 0 && rewrite.exitCode !== 3) throw new JobFailure("PROCESSING_FAILED");

  // Never ship a file that lost or gained pages along the way.
  if ((await countPages(finalPath, dir)) !== pageCount) throw new JobFailure("PROCESSING_FAILED");

  return readFile(finalPath);
}

async function countPages(path: string, dir: string): Promise<number> {
  const result = await runCommandCaptureAll("qpdf", ["--show-npages", path], { timeoutMs: 30_000, cwd: dir });
  const count = Number.parseInt(result.stdout.trim(), 10);
  if (result.exitCode !== 0 && result.exitCode !== 3) throw new JobFailure("UNSUPPORTED_FILE");
  if (!Number.isFinite(count) || count <= 0) throw new JobFailure("UNSUPPORTED_FILE");
  return count;
}
