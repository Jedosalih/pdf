import { readFile } from "node:fs/promises";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";
import { applyEditElements } from "../pdfEditElements.js";

interface FillSignOptions {
  fields: Record<string, unknown>;
  edits: unknown[];
}

const MAX_FIELD_NAME_LENGTH = 200;
const MAX_FIELD_VALUE_LENGTH = 2000;
const MAX_FIELDS = 200;

export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as FillSignOptions;
  const buffer = await readFile(inputs[0]!.path);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  let filledFieldCount = 0;
  const fieldEntries = Object.entries(options.fields ?? {}).slice(0, MAX_FIELDS);

  if (fieldEntries.length > 0) {
    try {
      const form = pdfDoc.getForm();
      for (const [name, rawValue] of fieldEntries) {
        if (name.length === 0 || name.length > MAX_FIELD_NAME_LENGTH) continue;
        if (typeof rawValue !== "string") continue;

        const field = form.getFieldMaybe(name);
        if (!field) continue; // no such field on this document -- ignore, don't fail the job

        // Checkboxes/radio groups/dropdowns are intentionally out of scope
        // for this first pass -- text fields cover the common "fill in
        // your name/date/address" case. See docs/DECISIONS.md.
        if (field instanceof PDFTextField) {
          field.setText(rawValue.slice(0, MAX_FIELD_VALUE_LENGTH));
          filledFieldCount += 1;
        }
      }
      if (filledFieldCount > 0) {
        form.flatten();
      }
    } catch {
      // pdfDoc.getForm() failing means there's no usable AcroForm here --
      // expected for most PDFs, not an error, just nothing to fill.
    }
  }

  const appliedEditCount = await applyEditElements(pdfDoc, options.edits ?? []);

  if (filledFieldCount === 0 && appliedEditCount === 0) {
    throw new ComputeFailure("VALIDATION_ERROR");
  }

  return Buffer.from(await pdfDoc.save());
}
