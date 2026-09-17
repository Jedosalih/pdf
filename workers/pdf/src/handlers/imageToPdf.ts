import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { runPureCompute } from "../runPureCompute.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface ImageToPdfOptions {
  fileOrder?: string[];
}

/** Shared by jpg-to-pdf and png-to-pdf — both tools reduce to "assemble
 * these images into one PDF, one page per image, in this order." */
export async function handleImageToPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  if (job.inputFiles.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as ImageToPdfOptions | null) ?? {};
  const order = options.fileOrder ?? job.inputFiles.map((file) => file.id);
  const filesById = new Map(job.inputFiles.map((file) => [file.id, file]));
  const orderedFiles = order
    .map((id) => filesById.get(id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  if (orderedFiles.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const inputs = await Promise.all(
    orderedFiles.map(async (file) => ({
      buffer: await downloadToBuffer(file.storageKey),
      mimeType: file.mimeType,
    })),
  );

  const outputBuffer = await withTempDir((dir) => runPureCompute("imageToPdf", inputs, {}, dir));

  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "converted.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
