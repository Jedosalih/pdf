import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface WatermarkOptions {
  text?: string;
}

const MAX_TEXT_LENGTH = 100;
const ROTATION_DEGREES = 45;

export async function handleWatermarkPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as WatermarkOptions | null) ?? {};
  const text = (options.text ?? "").trim();
  if (!text || text.length > MAX_TEXT_LENGTH) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const angleRad = (ROTATION_DEGREES * Math.PI) / 180;

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(12, Math.min(width, height) / 10);
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    // Rotating pdf-lib's drawText pivots around (x, y), which is the
    // glyph run's pre-rotation bottom-left corner — solve for the anchor
    // that puts the text's visual center at the page center after
    // rotating by `angleRad`, rather than eyeballing an offset.
    const cx = width / 2;
    const cy = height / 2;
    const anchorX =
      cx - (textWidth / 2) * Math.cos(angleRad) + (textHeight / 2) * Math.sin(angleRad);
    const anchorY =
      cy - (textWidth / 2) * Math.sin(angleRad) - (textHeight / 2) * Math.cos(angleRad);

    page.drawText(text, {
      x: anchorX,
      y: anchorY,
      size: fontSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.35,
      rotate: degrees(ROTATION_DEGREES),
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
      originalName: "watermarked.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
