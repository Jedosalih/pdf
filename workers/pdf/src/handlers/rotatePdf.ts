import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";

interface RotateOptions {
  degrees?: number;
}

const ALLOWED_DEGREES = new Set([90, 180, 270]);

export async function handleRotatePdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as RotateOptions | null) ?? {};
  const degrees = Math.round(options.degrees ?? 90);
  if (!ALLOWED_DEGREES.has(degrees)) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await runCommand(
        "qpdf",
        [inputPath, `--rotate=+${degrees}`, "--", outputPath],
        { timeoutMs: 60_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "rotated.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });
}
