import { randomUUID } from "node:crypto";
import type { Browser } from "playwright";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { renderHtmlToPdf } from "../render.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

export function createHtmlToPdfHandler(browser: Browser): (jobId: string) => Promise<void> {
  return async function handleHtmlToPdf(jobId: string): Promise<void> {
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { inputFiles: true },
    });

    const inputFile = job.inputFiles[0];
    if (!inputFile) {
      throw new JobFailure("VALIDATION_ERROR");
    }

    const buffer = await downloadToBuffer(inputFile.storageKey);
    const html = buffer.toString("utf-8");

    const pdfBuffer = await renderHtmlToPdf(browser, html);

    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, pdfBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.pdf",
        mimeType: "application/pdf",
        size: pdfBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  };
}
