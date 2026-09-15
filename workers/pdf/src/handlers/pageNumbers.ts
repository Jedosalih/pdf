import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

type Position =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

interface PageNumbersOptions {
  position?: Position;
  startAt?: number;
}

const ALLOWED_POSITIONS = new Set<Position>([
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right",
]);

const MARGIN = 24;
const FONT_SIZE = 11;
const MAX_START_AT = 100_000;

export async function handlePageNumbers(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as PageNumbersOptions | null) ?? {};
  const position = options.position ?? "bottom-center";
  if (!ALLOWED_POSITIONS.has(position)) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const startAt = Math.round(options.startAt ?? 1);
  if (!Number.isFinite(startAt) || startAt < 1 || startAt > MAX_START_AT) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    const label = String(startAt + index);
    const textWidth = font.widthOfTextAtSize(label, FONT_SIZE);

    const x = position.endsWith("left")
      ? MARGIN
      : position.endsWith("right")
        ? width - MARGIN - textWidth
        : (width - textWidth) / 2;
    const y = position.startsWith("top") ? height - MARGIN : MARGIN;

    page.drawText(label, {
      x,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "numbered.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
