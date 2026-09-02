import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { getPageCount, extractPages } from "./pageSelection.js";

interface DeletePagesOptions {
  pagesToDelete?: number[];
}

export async function handleDeletePages(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as DeletePagesOptions | null) ?? {};
  const pagesToDelete = new Set(
    (options.pagesToDelete ?? []).map((n) => Math.floor(n)),
  );
  if (pagesToDelete.size === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    const totalPages = await getPageCount(inputPath, dir);
    for (const page of pagesToDelete) {
      if (page < 1 || page > totalPages) {
        throw new JobFailure("VALIDATION_ERROR");
      }
    }

    const keepPages: number[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (!pagesToDelete.has(page)) keepPages.push(page);
    }
    if (keepPages.length === 0) {
      throw new JobFailure("VALIDATION_ERROR");
    }

    await extractPages(inputPath, outputPath, keepPages, dir);

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "pages-deleted.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });
}
