import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { applyEditElements } from "../pdfEditElements.js";

interface EditPdfOptions {
  edits?: unknown;
}

/**
 * Applies a batch of overlay edits (text/image/rectangle/highlight/freehand
 * path) collected by the client-side canvas editor -- see
 * ../pdfEditElements.ts for how each element becomes real content-stream
 * drawing via pdf-lib (this adds new content, it does not modify or claim
 * to modify any pre-existing text in place -- see docs/PDF_ENGINE.md's
 * edit-pdf section for the honesty framing).
 */
export async function handleEditPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as EditPdfOptions | null) ?? {};
  const rawEdits = Array.isArray(options.edits) ? (options.edits as unknown[]) : [];
  if (rawEdits.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }

  const appliedCount = await applyEditElements(pdfDoc, rawEdits);
  if (appliedCount === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "edited.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
