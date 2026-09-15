import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { getPageCount, extractPages } from "./pageSelection.js";

interface ExtractPagesOptions {
  pagesToKeep?: number[];
}

export async function handleExtractPages(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as ExtractPagesOptions | null) ?? {};
  const pagesToKeep = [...new Set((options.pagesToKeep ?? []).map((n) => Math.floor(n)))].sort(
    (a, b) => a - b,
  );
  if (pagesToKeep.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    const totalPages = await getPageCount(inputPath, dir);
    for (const page of pagesToKeep) {
      if (page < 1 || page > totalPages) {
        throw new JobFailure("VALIDATION_ERROR");
      }
    }

    await extractPages(inputPath, outputPath, pagesToKeep, dir);

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "extracted-pages.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
