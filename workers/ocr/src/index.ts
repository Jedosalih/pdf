import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./db.js";
import { handleOcrPdf } from "./handlers/ocrPdf.js";
import { JobFailure } from "./errors.js";

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

interface ProcessingJobPayload {
  jobId: string;
}

const handlers: Record<string, (jobId: string) => Promise<void>> = {
  "ocr-pdf": handleOcrPdf,
};

const worker = new Worker<ProcessingJobPayload>(
  "ocr",
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
      console.log(
        `[ocr-worker] job=${jobId} tool=${dbJob.toolId} result=completed durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      const code = error instanceof JobFailure ? error.code : "PROCESSING_FAILED";
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorCode: code },
      });
      console.error(
        `[ocr-worker] job=${jobId} tool=${dbJob.toolId} result=failed errorCode=${code} durationMs=${Date.now() - startedAt}`,
        error,
      );
    }
  },
  // OCR is CPU-heavy and slow per page — deliberately low concurrency,
  // own queue so a long OCR run can't starve any other worker's jobs.
  { connection, concurrency: 2 },
);

worker.on("error", (error) => {
  console.error("[ocr-worker] worker error:", error);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log("[ocr-worker] listening on queue: ocr");
