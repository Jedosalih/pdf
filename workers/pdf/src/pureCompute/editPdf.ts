import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";
import { applyEditElements } from "../pdfEditElements.js";

interface EditPdfOptions {
  edits: unknown[];
}

export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as EditPdfOptions;
  const buffer = await readFile(inputs[0]!.path);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  const appliedCount = await applyEditElements(pdfDoc, options.edits);
  if (appliedCount === 0) {
    throw new ComputeFailure("VALIDATION_ERROR");
  }

  return Buffer.from(await pdfDoc.save());
}
