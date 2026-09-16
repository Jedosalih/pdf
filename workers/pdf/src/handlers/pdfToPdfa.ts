import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { SRGB_ICC_PROFILE_PATH, buildPdfaDefPs } from "../pdfaTemplate.js";

/**
 * Best-effort PDF/A-2b conversion — no ISO 19005 compliance claim. There is
 * no validator (e.g. veraPDF) in this pipeline; the tool's own copy must
 * say "best-effort" (see docs/PDF_ENGINE.md, docs/DECISIONS.md).
 */
export async function handlePdfToPdfa(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const defPath = join(dir, "PDFA_def.ps");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);
    await writeFile(defPath, buildPdfaDefPs(SRGB_ICC_PROFILE_PATH));

    try {
      await runCommand(
        "gs",
        [
          "-dPDFA=2",
          "-dBATCH",
          "-dNOPAUSE",
          "-dNOOUTERSAVE",
          "-dSAFER",
          `--permit-file-read=${SRGB_ICC_PROFILE_PATH}`,
          "-sColorConversionStrategy=RGB",
          "-sProcessColorModel=DeviceRGB",
          "-dPDFACompatibilityPolicy=1",
          "-sDEVICE=pdfwrite",
          `-sOutputFile=${outputPath}`,
          defPath,
          inputPath,
        ],
        { timeoutMs: 120_000, cwd: dir },
      );
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "pdfa.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
