import { randomUUID } from "node:crypto";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { applyEditElements } from "../pdfEditElements.js";

interface FillSignOptions {
  /** fieldName -> text value, for real AcroForm text fields detected
   * client-side via pdfjs-dist's page.getAnnotations(). */
  fields?: unknown;
  /** Signature/initial/date placement -- the exact same overlay element
   * shape edit-pdf uses (only "text" and "image" are expected here, but
   * applyEditElements handles the full set uniformly). */
  edits?: unknown;
}

const MAX_FIELD_NAME_LENGTH = 200;
const MAX_FIELD_VALUE_LENGTH = 2000;
const MAX_FIELDS = 200;

/**
 * Fill & Sign, split into its two genuinely different mechanisms:
 *
 * 1. Real AcroForm text fields (if the PDF has any) are filled through
 *    pdf-lib's form API and flattened into static page content -- this is
 *    "fill," it only applies to PDFs that actually have form fields.
 * 2. A drawn or uploaded signature (and any other freeform placement) is
 *    applied the same way edit-pdf's overlay elements are, via the shared
 *    applyEditElements() -- this is "sign," and works on any PDF.
 *
 * This produces a *visual* signature -- new ink/image content on the
 * page -- not a cryptographic digital signature (PAdES/PKCS#7). No
 * library in this stack signs PDFs cryptographically, and doing that
 * correctly needs a real PKI/certificate story, which is a deliberate,
 * documented scope boundary (see docs/DECISIONS.md), not an oversight.
 */
export async function handleFillSignPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as FillSignOptions | null) ?? {};
  const buffer = await downloadToBuffer(inputFile.storageKey);

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch {
    throw new JobFailure("UNSUPPORTED_FILE");
  }

  let filledFieldCount = 0;
  const rawFields =
    options.fields && typeof options.fields === "object" && !Array.isArray(options.fields)
      ? (options.fields as Record<string, unknown>)
      : {};
  const fieldEntries = Object.entries(rawFields).slice(0, MAX_FIELDS);

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

  const rawEdits = Array.isArray(options.edits) ? (options.edits as unknown[]) : [];
  const appliedEditCount = await applyEditElements(pdfDoc, rawEdits);

  if (filledFieldCount === 0 && appliedEditCount === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const outputBuffer = Buffer.from(await pdfDoc.save());
  const storageKey = `results/${randomUUID()}.pdf`;
  await uploadBuffer(storageKey, outputBuffer, "application/pdf");

  await prisma.file.create({
    data: {
      userId: job.userId,
      guestId: job.guestId,
      storageKey,
      originalName: "signed.pdf",
      mimeType: "application/pdf",
      size: outputBuffer.byteLength,
      status: "READY",
      outputJobId: job.id,
      expiresAt: computeFileExpiry(job.userId),
    },
  });
}
