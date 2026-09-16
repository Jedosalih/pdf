import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

export async function handlePdfToText(jobId: string): Promise<void> {
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
    const outputPath = join(dir, "output.txt");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await runCommand("pdftotext", ["-layout", inputPath, outputPath], {
        timeoutMs: 60_000,
        cwd: dir,
      });
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.txt`;
    await uploadBuffer(storageKey, outputBuffer, "text/plain");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "extracted.txt",
        mimeType: "text/plain",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
