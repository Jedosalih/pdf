import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { runPureCompute } from "../runPureCompute.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface WatermarkOptions {
  text?: string;
}

const MAX_TEXT_LENGTH = 100;

export async function handleWatermarkPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as WatermarkOptions | null) ?? {};
  const text = (options.text ?? "").trim();
  if (!text || text.length > MAX_TEXT_LENGTH) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  const outputBuffer = await withTempDir((dir) =>
    runPureCompute("watermarkPdf", [{ buffer, mimeType: "application/pdf" }], { text }, dir),
  );

  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "watermarked.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
