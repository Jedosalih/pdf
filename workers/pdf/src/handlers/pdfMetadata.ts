import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface MetadataOptions {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

const MAX_FIELD_LENGTH = 200;

export async function handlePdfMetadata(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as MetadataOptions | null) ?? {};
  const title = (options.title ?? "").trim();
  const author = (options.author ?? "").trim();
  const subject = (options.subject ?? "").trim();
  const keywords = (options.keywords ?? "").trim();
  const fields = [title, author, subject, keywords];

  // At least one field must be set — an empty options object would be a
  // no-op that still burns a daily-usage slot for nothing.
  if (fields.every((value) => value.length === 0)) {
    throw new JobFailure("VALIDATION_ERROR");
  }
  if (fields.some((value) => value.length > MAX_FIELD_LENGTH)) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }

  // Fields left blank keep whatever metadata the file already had —
  // this is an editor for existing values, not a reset to empty.
  if (title) pdfDoc.setTitle(title);
  if (author) pdfDoc.setAuthor(author);
  if (subject) pdfDoc.setSubject(subject);
  if (keywords) {
    pdfDoc.setKeywords(
      keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    );
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "metadata.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
