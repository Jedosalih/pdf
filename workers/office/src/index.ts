import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "./db.js";
import { createOfficeConvertHandler } from "./handlers/officeConvert.js";
import { handlePdfToExcel } from "./handlers/pdfToExcel.js";
import { handlePdfToPowerpoint } from "./handlers/pdfToPowerpoint.js";
import { JobFailure } from "./errors.js";

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

interface ProcessingJobPayload {
  jobId: string;
}

const handlers: Record<string, (jobId: string) => Promise<void>> = {
  "word-to-pdf": createOfficeConvertHandler({
    sourceExtension: "docx",
    targetExtension: "pdf",
    outputName: "converted.pdf",
  }),
  "excel-to-pdf": createOfficeConvertHandler({
    sourceExtension: "xlsx",
    targetExtension: "pdf",
    outputName: "converted.pdf",
  }),
  "powerpoint-to-pdf": createOfficeConvertHandler({
    sourceExtension: "pptx",
    targetExtension: "pdf",
    outputName: "converted.pdf",
  }),
  "pdf-to-word": createOfficeConvertHandler({
    sourceExtension: "pdf",
    targetExtension: "docx",
    outputName: "converted.docx",
    // Verified empirically: without this override, soffice loads the PDF
    // into Draw (not Writer) and then can't export to docx at all ("no
    // export filter for ...docx found") — see docs/DECISIONS.md. A bare
    // `--convert-to docx` (no explicit filter name) is sufficient once
    // the infilter is set; soffice auto-picks "MS Word 2007 XML" itself.
    infilter: "writer_pdf_import",
  }),
  // pdf-to-excel and pdf-to-powerpoint deliberately do NOT go through
  // LibreOffice — verified empirically that forcing a PDF into Writer and
  // exporting to Calc/Impress either crashes soffice outright or silently
  // produces an empty file (see docs/DECISIONS.md, workers/office/src/
  // handlers/pdfToExcel.ts, pdfToPowerpoint.ts for the real engines used).
  "pdf-to-excel": handlePdfToExcel,
  "pdf-to-powerpoint": handlePdfToPowerpoint,
};

const worker = new Worker<ProcessingJobPayload>(
  "office-conversion",
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
        `[office-worker] job=${jobId} tool=${dbJob.toolId} result=completed durationMs=${Date.now() - startedAt}`,
      );
    } catch (error) {
      const code = error instanceof JobFailure ? error.code : "PROCESSING_FAILED";
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "FAILED", completedAt: new Date(), errorCode: code },
      });
      console.error(
        `[office-worker] job=${jobId} tool=${dbJob.toolId} result=failed errorCode=${code} durationMs=${Date.now() - startedAt}`,
        error,
      );
    }
  },
  // Lower concurrency than pdf-processing — LibreOffice is the slowest,
  // most resource-heavy engine in this stack (own queue exists exactly so
  // a stuck/slow conversion here can't starve fast qpdf jobs elsewhere).
  { connection, concurrency: 2 },
);

worker.on("error", (error) => {
  console.error("[office-worker] worker error:", error);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log("[office-worker] listening on queue: office-conversion");
