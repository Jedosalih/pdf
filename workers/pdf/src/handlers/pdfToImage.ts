import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";

const RESOLUTION_DPI = 150;

interface ImageFormatConfig {
  pdftoppmFlag: string;
  extension: string;
  mimeType: string;
}

const FORMATS: Record<"jpeg" | "png", ImageFormatConfig> = {
  jpeg: { pdftoppmFlag: "-jpeg", extension: "jpg", mimeType: "image/jpeg" },
  png: { pdftoppmFlag: "-png", extension: "png", mimeType: "image/png" },
};

async function handlePdfToImage(jobId: string, format: "jpeg" | "png"): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const config = FORMATS[format];

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
        [config.pdftoppmFlag, "-r", String(RESOLUTION_DPI), inputPath, outputPrefix],
        { timeoutMs: 120_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const entries = await readdir(outputDir);
    const pageFiles = entries
      .map((name) => {
        const match = /^page-(\d+)\.\w+$/.exec(name);
        return match ? { name, pageNumber: Number.parseInt(match[1]!, 10) } : null;
      })
      .filter((entry): entry is { name: string; pageNumber: number } => entry !== null)
      .sort((a, b) => a.pageNumber - b.pageNumber);

    if (pageFiles.length === 0) {
      throw new JobFailure("PROCESSING_FAILED");
    }

    for (const { name, pageNumber } of pageFiles) {
      const imageBuffer = await readFile(join(outputDir, name));
      const storageKey = `results/${randomUUID()}.${config.extension}`;
      await uploadBuffer(storageKey, imageBuffer, config.mimeType);

      await prisma.file.create({
        data: {
          userId: job.userId,
          guestId: job.guestId,
          storageKey,
          originalName: `page-${pageNumber}.${config.extension}`,
          mimeType: config.mimeType,
          size: imageBuffer.byteLength,
          status: "READY",
          outputJobId: job.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
  });
}

export async function handlePdfToJpg(jobId: string): Promise<void> {
  return handlePdfToImage(jobId, "jpeg");
}

export async function handlePdfToPng(jobId: string): Promise<void> {
  return handlePdfToImage(jobId, "png");
}
