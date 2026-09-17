import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";

// A4 at 72pt/inch — pages take the image's own orientation, image is
// scaled to fit and centered (see docs/DECISIONS.md for why raw pixel
// dimensions aren't used directly as PDF points).
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export async function compute(
  inputs: { path: string; mimeType: string }[],
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  for (const input of inputs) {
    const buffer = await readFile(input.path);

    let image;
    try {
      image =
        input.mimeType === "image/png"
          ? await pdfDoc.embedPng(buffer)
          : await pdfDoc.embedJpg(buffer);
    } catch {
      throw new ComputeFailure("UNSUPPORTED_FILE");
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

  return Buffer.from(await pdfDoc.save());
}
