import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";

type Position =
  | "bottom-center"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "top-left"
  | "top-right";

interface PageNumbersOptions {
  position: Position;
  startAt: number;
}

const MARGIN = 24;
const FONT_SIZE = 11;

export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as PageNumbersOptions;
  const buffer = await readFile(inputs[0]!.path);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    const label = String(options.startAt + index);
    const textWidth = font.widthOfTextAtSize(label, FONT_SIZE);

    const x = options.position.endsWith("left")
      ? MARGIN
      : options.position.endsWith("right")
        ? width - MARGIN - textWidth
        : (width - textWidth) / 2;
    const y = options.position.startsWith("top") ? height - MARGIN : MARGIN;

    page.drawText(label, {
      x,
      y,
      size: FONT_SIZE,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  return Buffer.from(await pdfDoc.save());
}
