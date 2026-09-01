import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./db.js";
import { handleMergePdf } from "./handlers/mergePdf.js";
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
};

const worker = new Worker<ProcessingJobPayload>(
  "pdf-processing",
  async (bullJob: BullJob<ProcessingJobPayload>) => {
    const { jobId } = bullJob.data;

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
    } catch (error) {
      const code = error instanceof JobFailure ? error.code : "PROCESSING_FAILED";
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorCode: code },
      });
      // Full error is logged server-side only — never surfaced to the client.
      console.error(`[pdf-worker] job ${jobId} failed:`, error);
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
