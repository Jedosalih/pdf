import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";

interface WatermarkOptions {
  text: string;
}

const ROTATION_DEGREES = 45;

export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as WatermarkOptions;
  const buffer = await readFile(inputs[0]!.path);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const angleRad = (ROTATION_DEGREES * Math.PI) / 180;

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(12, Math.min(width, height) / 10);
    const textWidth = font.widthOfTextAtSize(options.text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    const cx = width / 2;
    const cy = height / 2;
    const anchorX =
      cx - (textWidth / 2) * Math.cos(angleRad) + (textHeight / 2) * Math.sin(angleRad);
    const anchorY =
      cy - (textWidth / 2) * Math.sin(angleRad) - (textHeight / 2) * Math.cos(angleRad);

    page.drawText(options.text, {
      x: anchorX,
      y: anchorY,
      size: fontSize,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.35,
      rotate: degrees(ROTATION_DEGREES),
    });
  }

  return Buffer.from(await pdfDoc.save());
}
