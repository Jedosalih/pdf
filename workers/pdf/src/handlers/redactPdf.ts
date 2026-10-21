import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { parseRedactionBoxes, redactPdfFile } from "../redaction.js";

interface RedactPdfOptions {
  boxes?: unknown;
}

/**
 * Job glue around `redactPdfFile` (src/redaction.ts), which holds the
 * actual pipeline and its guarantees. This is a safety-critical tool: any
 * page that can't be redacted fails the whole job rather than shipping a
 * file the user could mistake for fully redacted.
 */
export async function handleRedactPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as RedactPdfOptions | null) ?? {};
  const boxes = parseRedactionBoxes(options.boxes);
  if (boxes.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    await writeFile(inputPath, buffer);

    const outputBuffer = await redactPdfFile(inputPath, boxes, dir);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "redacted.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
