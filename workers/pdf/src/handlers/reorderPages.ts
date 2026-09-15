import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { getPageCount, extractPages } from "./pageSelection.js";

interface ReorderPagesOptions {
  pageOrder?: number[];
}

export async function handleReorderPages(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as ReorderPagesOptions | null) ?? {};
  const pageOrder = (options.pageOrder ?? []).map((n) => Math.floor(n));
  if (pageOrder.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    const totalPages = await getPageCount(inputPath, dir);

    // Must be a genuine permutation of every page — reordering can't drop
    // or duplicate pages (that's what Delete/Extract are for).
    const expected = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
    const provided = new Set(pageOrder);
    const isValidPermutation =
      pageOrder.length === totalPages &&
      provided.size === totalPages &&
      [...expected].every((page) => provided.has(page));
    if (!isValidPermutation) {
      throw new JobFailure("VALIDATION_ERROR");
    }

    await extractPages(inputPath, outputPath, pageOrder, dir);

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "reordered.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
