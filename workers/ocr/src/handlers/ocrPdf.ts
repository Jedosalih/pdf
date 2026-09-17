import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

type OcrLanguage = "eng" | "ara" | "tur" | "eng+ara+tur";

interface OcrOptions {
  language?: OcrLanguage;
}

const ALLOWED_LANGUAGES = new Set<OcrLanguage>(["eng", "ara", "tur", "eng+ara+tur"]);

/**
 * `--skip-text` (only OCR image-only pages, leave existing text layers
 * alone) and `--output-type pdf` (not `pdfa`) are both deliberate —
 * this tool doesn't claim the separate, already best-effort-framed
 * `pdf-to-pdfa` tool's compliance framing (see docs/DECISIONS.md).
 */
export async function handleOcrPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as OcrOptions | null) ?? {};
  const language = options.language ?? "eng";
  if (!ALLOWED_LANGUAGES.has(language)) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await runCommand(
        "ocrmypdf",
        [
          "--language",
          language,
          "--output-type",
          "pdf",
          "--skip-text",
          inputPath,
          outputPath,
        ],
        { timeoutMs: 300_000, cwd: dir },
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
        originalName: "ocr.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
