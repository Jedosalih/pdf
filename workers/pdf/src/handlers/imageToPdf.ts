import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

// A4 at 72pt/inch — pages take the image's own orientation, image is
// scaled to fit and centered (see docs/DECISIONS.md for why raw pixel
// dimensions aren't used directly as PDF points).
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

interface ImageToPdfOptions {
  fileOrder?: string[];
}

/** Shared by jpg-to-pdf and png-to-pdf — both tools reduce to "assemble
 * these images into one PDF, one page per image, in this order." */
export async function handleImageToPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  if (job.inputFiles.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as ImageToPdfOptions | null) ?? {};
  const order = options.fileOrder ?? job.inputFiles.map((file) => file.id);
  const filesById = new Map(job.inputFiles.map((file) => [file.id, file]));
  const orderedFiles = order
    .map((id) => filesById.get(id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  if (orderedFiles.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const pdfDoc = await PDFDocument.create();

  for (const file of orderedFiles) {
    const buffer = await downloadToBuffer(file.storageKey);

    let image;
    try {
      image =
        file.mimeType === "image/png"
          ? await pdfDoc.embedPng(buffer)
          : await pdfDoc.embedJpg(buffer);
    } catch {
      throw new JobFailure("UNSUPPORTED_FILE");
    }

    const portrait = image.height >= image.width;
    const pageWidth = portrait ? A4_WIDTH : A4_HEIGHT;
    const pageHeight = portrait ? A4_HEIGHT : A4_WIDTH;
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "converted.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
