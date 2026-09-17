import { randomUUID } from "node:crypto";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import PptxGenJSImport from "pptxgenjs";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

const SLIDE_WIDTH_IN = 11.69;
const SLIDE_HEIGHT_IN = 8.27; // A4 landscape — matches this project's default page assumption

/**
 * `pptxgenjs`'s shipped ambient `.d.ts` uses an old UMD-style
 * `export as namespace X` + `export default X` shape that TypeScript's
 * `NodeNext` module resolution mis-resolves to the whole module namespace
 * instead of the constructor — a known interop quirk, not a runtime bug
 * (confirmed working identically in scripts/generate-fixtures.mjs, a
 * plain-JS file with no type checking). A small local interface covering
 * only the API this handler actually uses sidesteps it cleanly.
 */
interface PptxSlide {
  addImage(options: {
    path: string;
    x: number;
    y: number;
    w: number;
    h: number;
    sizing: { type: "contain"; w: number; h: number };
  }): void;
}

interface PptxPresentation {
  layout: string;
  defineLayout(options: { name: string; width: number; height: number }): void;
  addSlide(): PptxSlide;
  write(options: { outputType: "nodebuffer" }): Promise<Buffer>;
}

const PptxGenJS = PptxGenJSImport as unknown as new () => PptxPresentation;

/**
 * NOT routed through LibreOffice — empirically verified (see
 * docs/DECISIONS.md) that forcing a PDF into LibreOffice's Writer import
 * path and exporting to Impress's PPTX format silently produces a
 * technically-valid but completely empty presentation (0 slides), not a
 * loud failure. Instead: rasterize each page (`pdftoppm`, already used by
 * `pdf-to-jpg`/`pdf-to-png`) and build one image-filled slide per page via
 * `pptxgenjs`. This preserves exact visual layout but the result is a
 * picture, not editable text — stated plainly in the tool's own copy, not
 * presented as equivalent to a real PDF-to-PowerPoint content converter.
 */
export async function handlePdfToPowerpoint(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    const outputDir = join(dir, "pages");
    await mkdir(outputDir, { recursive: true });
    const outputPrefix = join(outputDir, "page");

    try {
      await runCommand(
        "pdftoppm",
        ["-png", "-r", "150", inputPath, outputPrefix],
        { timeoutMs: 120_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const entries = await readdir(outputDir);
    const pageFiles = entries
      .map((name) => {
        const match = /^page-(\d+)\.png$/.exec(name);
        return match ? { name, pageNumber: Number.parseInt(match[1]!, 10) } : null;
      })
      .filter((entry): entry is { name: string; pageNumber: number } => entry !== null)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    if (pageFiles.length === 0) {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const pres = new PptxGenJS();
    pres.defineLayout({ name: "PDF_PAGE", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
    pres.layout = "PDF_PAGE";

    for (const { name } of pageFiles) {
      const slide = pres.addSlide();
      slide.addImage({
        path: join(outputDir, name),
        x: 0,
        y: 0,
        w: SLIDE_WIDTH_IN,
        h: SLIDE_HEIGHT_IN,
        sizing: { type: "contain", w: SLIDE_WIDTH_IN, h: SLIDE_HEIGHT_IN },
      });
    }

    const outputBuffer = await pres.write({ outputType: "nodebuffer" });
    const mimeType =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const storageKey = `results/${randomUUID()}.pptx`;
    await uploadBuffer(storageKey, outputBuffer, mimeType);

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.pptx",
        mimeType,
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
