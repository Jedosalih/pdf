import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./db.js";
import { handleMergePdf } from "./handlers/mergePdf.js";
import { handleSplitPdf } from "./handlers/splitPdf.js";
import { handleCompressPdf } from "./handlers/compressPdf.js";
import { handleRotatePdf } from "./handlers/rotatePdf.js";
import { handleDeletePages } from "./handlers/deletePages.js";
import { handleExtractPages } from "./handlers/extractPages.js";
import { handleReorderPages } from "./handlers/reorderPages.js";
import { handleImageToPdf } from "./handlers/imageToPdf.js";
import { handlePdfToJpg, handlePdfToPng } from "./handlers/pdfToImage.js";
import { handleWatermarkPdf } from "./handlers/watermarkPdf.js";
import { handlePageNumbers } from "./handlers/pageNumbers.js";
import { handleProtectPdf } from "./handlers/protectPdf.js";
import { handleUnlockPdf } from "./handlers/unlockPdf.js";
import { handlePdfMetadata } from "./handlers/pdfMetadata.js";
import { handlePdfToText } from "./handlers/pdfToText.js";
import { handlePdfToPdfa } from "./handlers/pdfToPdfa.js";
import { handleFlattenPdf } from "./handlers/flattenPdf.js";
import { handleRepairPdf } from "./handlers/repairPdf.js";
import { handleEditPdf } from "./handlers/editPdf.js";
import { handleFillSignPdf } from "./handlers/fillSignPdf.js";
import { JobFailure } from "./errors.js";

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

interface ProcessingJobPayload {
  jobId: string;
}

const handlers: Record<string, (jobId: string) => Promise<void>> = {
  "merge-pdf": handleMergePdf,
  "split-pdf": handleSplitPdf,
  "compress-pdf": handleCompressPdf,
  "rotate-pdf": handleRotatePdf,
  "delete-pages": handleDeletePages,
  "extract-pages": handleExtractPages,
  "reorder-pages": handleReorderPages,
  "jpg-to-pdf": handleImageToPdf,
  "png-to-pdf": handleImageToPdf,
  "pdf-to-jpg": handlePdfToJpg,
  "pdf-to-png": handlePdfToPng,
  "watermark-pdf": handleWatermarkPdf,
  "page-numbers": handlePageNumbers,
  "protect-pdf": handleProtectPdf,
  "unlock-pdf": handleUnlockPdf,
  "pdf-metadata": handlePdfMetadata,
  "pdf-to-text": handlePdfToText,
  "pdf-to-pdfa": handlePdfToPdfa,
  "flatten-pdf": handleFlattenPdf,
  "repair-pdf": handleRepairPdf,
  "edit-pdf": handleEditPdf,
  "fill-sign-pdf": handleFillSignPdf,
};

const worker = new Worker<ProcessingJobPayload>(
  "pdf-processing",
  async (bullJob: BullJob<ProcessingJobPayload>) => {
    const { jobId } = bullJob.data;
    const startedAt = Date.now();

    const dbJob = await prisma.job.update({
      where: { id: jobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    const handler = handlers[dbJob.toolId];
    if (!handler) {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: "UNKNOWN_TOOL",
        },
      });
      return;
    }

    try {
      await handler(jobId);
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "COMPLETED", completedAt: new Date(), progress: 100 },
      });
      // Structured, non-sensitive: job id, tool id, duration, result only —
      // never file contents (docs/SECURITY.md §8).
      console.log(
        `[pdf-worker] job=${jobId} tool=${dbJob.toolId} result=completed durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      const code = error instanceof JobFailure ? error.code : "PROCESSING_FAILED";
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorCode: code },
      });
      // Full error is logged server-side only — never surfaced to the client.
      console.error(
        `[pdf-worker] job=${jobId} tool=${dbJob.toolId} result=failed errorCode=${code} durationMs=${Date.now() - startedAt}`,
        error,
      );
    }
  },
  { connection, concurrency: 4 },
);

worker.on("error", (error) => {
  console.error("[pdf-worker] worker error:", error);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log("[pdf-worker] listening on queue: pdf-processing");
