import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { runPureCompute } from "../runPureCompute.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

type Position =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

interface PageNumbersOptions {
  position?: Position;
  startAt?: number;
}

const ALLOWED_POSITIONS = new Set<Position>([
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right",
]);

const MAX_START_AT = 100_000;

export async function handlePageNumbers(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as PageNumbersOptions | null) ?? {};
  const position = options.position ?? "bottom-center";
  if (!ALLOWED_POSITIONS.has(position)) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const startAt = Math.round(options.startAt ?? 1);
  if (!Number.isFinite(startAt) || startAt < 1 || startAt > MAX_START_AT) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  const outputBuffer = await withTempDir((dir) =>
    runPureCompute(
      "pageNumbers",
      [{ buffer, mimeType: "application/pdf" }],
      { position, startAt },
      dir,
    ),
  );

  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "numbered.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
