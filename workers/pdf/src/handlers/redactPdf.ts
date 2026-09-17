import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

const RESOLUTION_DPI = 150;
const MAX_BOXES = 300;
const MAX_DIMENSION = 20_000;

interface RedactionBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RedactPdfOptions {
  boxes?: unknown;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Real redaction, not a drawn box over intact content: every page that has
 * at least one requested box is rasterized whole (pdftoppm), the black
 * boxes are burned into those pixels (sharp), and the page's *entire*
 * original content -- text, vectors, everything -- is discarded and
 * replaced by that flattened image. There is no "remove the black
 * rectangle to reveal the text underneath" failure mode, because there is
 * no text object left underneath at all -- only the redacted raster.
 * Pages with no requested box are left completely untouched (not even
 * rasterized), preserving their original fidelity.
 *
 * This is a safety-critical tool: if a page that was asked to be redacted
 * can't actually be processed, the job fails loudly rather than silently
 * shipping a file the user believes is redacted but isn't (unlike most
 * other tools here, where skipping one bad element and continuing is the
 * right call).
 */
export async function handleRedactPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }
  const pageCount = pdfDoc.getPageCount();

  const options = (job.options as RedactPdfOptions | null) ?? {};
  const rawBoxes = Array.isArray(options.boxes) ? (options.boxes as unknown[]).slice(0, MAX_BOXES) : [];

  const boxesByPage = new Map<number, RedactionBox[]>();
  for (const raw of rawBoxes) {
    if (!raw || typeof raw !== "object") continue;
    const b = raw as Record<string, unknown>;
    const page = num(b.page);
    const x = num(b.x);
    const y = num(b.y);
    const width = num(b.width);
    const height = num(b.height);
    if (page === null || page < 0 || page >= pageCount) continue;
    if (x === null || y === null || width === null || height === null) continue;
    if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) continue;

    const list = boxesByPage.get(page) ?? [];
    list.push({ page, x, y, width, height });
    boxesByPage.set(page, list);
  }

  if (boxesByPage.size === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    await writeFile(inputPath, buffer);

    const outputDir = join(dir, "pages");
    await mkdir(outputDir, { recursive: true });
    const outputPrefix = join(outputDir, "page");

    try {
      await runCommand(
        "pdftoppm",
        ["-png", "-r", String(RESOLUTION_DPI), inputPath, outputPrefix],
        { timeoutMs: 180_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const entries = await readdir(outputDir);
    const rasterByPage = new Map<number, string>();
    for (const name of entries) {
      const match = /^page-(\d+)\.png$/.exec(name);
      if (match) {
        // pdftoppm numbers pages from 1; every other model in this codebase
        // (and the client's edit list) is 0-indexed.
        rasterByPage.set(Number.parseInt(match[1]!, 10) - 1, name);
      }
    }

    // Descending order so each replacement's insert+remove (a net no-shift
    // operation) never disturbs a lower index this loop hasn't reached yet.
    const pagesToRedact = [...boxesByPage.keys()].sort((a, b) => b - a);
    let redactedCount = 0;

    for (const pageIndex of pagesToRedact) {
      const boxes = boxesByPage.get(pageIndex)!;
      const rasterName = rasterByPage.get(pageIndex);
      if (!rasterName) continue; // counted below -- triggers a hard failure

      const originalPage = pdfDoc.getPage(pageIndex);
      const { width: pageWidthPt, height: pageHeightPt } = originalPage.getSize();
      const scale = RESOLUTION_DPI / 72;

      const rawImage = await readFile(join(outputDir, rasterName));
      const metadata = await sharp(rawImage).metadata();
      const imageWidth = metadata.width ?? Math.round(pageWidthPt * scale);
      const imageHeight = metadata.height ?? Math.round(pageHeightPt * scale);

      const rectMarkup = boxes
        .map((box) => {
          const rx = Math.max(0, box.x * scale);
          const ry = Math.max(0, box.y * scale);
          const rw = Math.min(box.width * scale, imageWidth - rx);
          const rh = Math.min(box.height * scale, imageHeight - ry);
          if (rw <= 0 || rh <= 0) return "";
          return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="black"/>`;
        })
        .filter(Boolean)
        .join("");
      if (!rectMarkup) continue; // every box on this page was degenerate -- nothing to burn in

      const svgOverlay = `<svg width="${imageWidth}" height="${imageHeight}" xmlns="http://www.w3.org/2000/svg">${rectMarkup}</svg>`;

      let redactedPng: Buffer;
      try {
        redactedPng = await sharp(rawImage)
          .composite([{ input: Buffer.from(svgOverlay) }])
          .png()
          .toBuffer();
      } catch {
        continue; // counted below -- triggers a hard failure
      }

      const embeddedImage = await pdfDoc.embedPng(redactedPng);
      const newPage = pdfDoc.insertPage(pageIndex, [pageWidthPt, pageHeightPt]);
      newPage.drawImage(embeddedImage, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
      pdfDoc.removePage(pageIndex + 1);
      redactedCount += 1;
    }

    if (redactedCount !== boxesByPage.size) {
      // At least one requested page failed to redact -- never ship a file
      // the user could mistake for fully redacted.
      throw new JobFailure("PROCESSING_FAILED");
    }

    const outputBuffer = Buffer.from(await pdfDoc.save());
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "redacted.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
