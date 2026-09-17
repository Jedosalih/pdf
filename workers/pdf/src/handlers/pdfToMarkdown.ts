import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { runPureCompute } from "../runPureCompute.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

/**
 * The actual pdfjs-dist text-position analysis (../pureCompute/pdfToMarkdown.ts)
 * runs in an isolated, timed-out subprocess -- see ../runPureCompute.ts for
 * why a pure-JS handler needs this instead of a Promise-race timeout.
 */
export async function handlePdfToMarkdown(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  const outputBuffer = await withTempDir((dir) =>
    runPureCompute("pdfToMarkdown", [{ buffer, mimeType: "application/pdf" }], {}, dir),
  );

  const storageKey = `results/${randomUUID()}.md`;
  await uploadBuffer(storageKey, outputBuffer, "text/markdown");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "converted.md",
      mimeType: "text/markdown",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
