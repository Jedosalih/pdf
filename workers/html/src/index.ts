import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { chromium } from "playwright";
import { prisma } from "./db.js";
import { createHtmlToPdfHandler } from "./handlers/htmlToPdf.js";
import { createMarkdownToPdfHandler } from "./handlers/markdownToPdf.js";
import { JobFailure } from "./errors.js";

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

interface ProcessingJobPayload {
  jobId: string;
}

async function main() {
  // One Chromium process for the worker's lifetime — a fresh, isolated
  // `BrowserContext` per job (see render.ts) is cheap and gives the same
  // per-job isolation as every other worker's per-job temp directory,
  // without paying Chromium's full startup cost on every single job.
  // Default `chromiumSandbox: true` is kept intentionally — see
  // docs/DECISIONS.md for why blanket --no-sandbox is not an acceptable
  // alternative for a hostile-HTML-input worker.
  const browser = await chromium.launch({ headless: true });

  const handlers: Record<string, (jobId: string) => Promise<void>> = {
    "html-to-pdf": createHtmlToPdfHandler(browser),
    "markdown-to-pdf": createMarkdownToPdfHandler(browser),
  };

  const worker = new Worker<ProcessingJobPayload>(
    "html-rendering",
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
          `[html-worker] job=${jobId} tool=${dbJob.toolId} result=completed durationMs=${Date.now() - startedAt}`,
        );
      } catch (error) {
        const code = error instanceof JobFailure ? error.code : "PROCESSING_FAILED";
        await prisma.job.update({
          where: { id: jobId },
          data: { status: "FAILED", completedAt: new Date(), errorCode: code },
        });
        console.error(
          `[html-worker] job=${jobId} tool=${dbJob.toolId} result=failed errorCode=${code} durationMs=${Date.now() - startedAt}`,
          error,
        );
      }
    },
    // Chromium renders are heavier and more variable-duration than a
    // qpdf-class job — own queue, deliberately low concurrency.
    { connection, concurrency: 2 },
  );

  worker.on("error", (error) => {
    console.error("[html-worker] worker error:", error);
  });

  process.on("SIGTERM", async () => {
    await worker.close();
    await browser.close();
    await prisma.$disconnect();
    process.exit(0);
  });

  console.log("[html-worker] listening on queue: html-rendering");
}

main().catch((error) => {
  console.error("[html-worker] fatal startup error:", error);
  process.exit(1);
});
