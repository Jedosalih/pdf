import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { runPureCompute } from "../runPureCompute.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

interface FillSignOptions {
  /** fieldName -> text value, for real AcroForm text fields detected
   * client-side via pdfjs-dist's page.getAnnotations(). */
  fields?: unknown;
  /** Signature/initial/date placement -- the exact same overlay element
   * shape edit-pdf uses (only "text" and "image" are expected here, but
   * applyEditElements handles the full set uniformly). */
  edits?: unknown;
}

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
 * The actual pdf-lib work runs in an isolated, timed-out subprocess --
 * see ../runPureCompute.ts.
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
  const rawFields =
    options.fields && typeof options.fields === "object" && !Array.isArray(options.fields)
      ? (options.fields as Record<string, unknown>)
      : {};
  const rawEdits = Array.isArray(options.edits) ? (options.edits as unknown[]) : [];

  const buffer = await downloadToBuffer(inputFile.storageKey);

  const outputBuffer = await withTempDir((dir) =>
    runPureCompute(
      "fillSignPdf",
      [{ buffer, mimeType: "application/pdf" }],
      { fields: rawFields, edits: rawEdits },
      dir,
    ),
  );

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
