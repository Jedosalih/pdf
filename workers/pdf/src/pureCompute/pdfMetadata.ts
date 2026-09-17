import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";

interface MetadataOptions {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as MetadataOptions;
  const buffer = await readFile(inputs[0]!.path);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  if (options.title) pdfDoc.setTitle(options.title);
  if (options.author) pdfDoc.setAuthor(options.author);
  if (options.subject) pdfDoc.setSubject(options.subject);
  if (options.keywords) {
    pdfDoc.setKeywords(
      options.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    );
  }

  return Buffer.from(await pdfDoc.save());
}
