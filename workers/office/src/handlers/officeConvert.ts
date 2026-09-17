import { randomUUID } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

interface OfficeConvertConfig {
  /** Fixed by the tool, never derived from user-controlled `originalName` —
   * each direction has exactly one valid source format. */
  sourceExtension: string;
  targetExtension: string;
  outputName: string;
  /**
   * `soffice`'s default PDF import loads a PDF into Draw (graphics-only) —
   * `writer_pdf_import` forces it into Writer instead, reconstructing
   * reflowable text. Required for `pdf-to-word` (verified empirically:
   * without it, `soffice` errors "no export filter for ...docx found"
   * because a Draw document can't export to a Writer format at all).
   */
  infilter?: string;
  /**
   * The auto-picked export filter for a bare extension isn't always the
   * one that actually works for a given (infilter, target) combination —
   * verified empirically that `docx` needs the explicit "MS Word 2007
   * XML" filter name once `writer_pdf_import` is in play.
   */
  explicitFilterName?: string;
}

/**
 * `soffice --convert-to` auto-detects the *input* format from the file's
 * extension, so the source file must be written with the extension the
 * tool actually expects — the only thing that varies per direction is
 * which extension goes in and which comes out (plus, for `pdf-to-word`,
 * the infilter/explicit-filter overrides above).
 */
async function convertWithLibreOffice(
  inputPath: string,
  config: OfficeConvertConfig,
  dir: string,
): Promise<string> {
  const profileDir = join(dir, "profile");
  const convertToArg = config.explicitFilterName
    ? `${config.targetExtension}:${config.explicitFilterName}`
    : config.targetExtension;

  const args = [
    "--headless",
    "--norestore",
    `-env:UserInstallation=file://${profileDir}`,
  ];
  if (config.infilter) {
    // Must be a single `--infilter=value` token — `soffice` rejects
    // `--infilter value` as two separate arguments ("Error in option:
    // --infilter"), verified empirically against the real binary.
    args.push(`--infilter=${config.infilter}`);
  }
  args.push("--convert-to", convertToArg, "--outdir", dir, inputPath);

  await runCommand("soffice", args, { timeoutMs: 180_000, cwd: dir });

  const files = await readdir(dir);
  const outputName = files.find((name) =>
    name.toLowerCase().endsWith(`.${config.targetExtension}`),
  );
  if (!outputName) {
    throw new JobFailure("PROCESSING_FAILED");
  }
  return join(dir, outputName);
}

export function createOfficeConvertHandler(
  config: OfficeConvertConfig,
): (jobId: string) => Promise<void> {
  return async function handleOfficeConvert(jobId: string): Promise<void> {
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { inputFiles: true },
    });

    const inputFile = job.inputFiles[0];
    if (!inputFile) {
      throw new JobFailure("VALIDATION_ERROR");
    }

    await withTempDir(async (dir) => {
      const inputPath = join(dir, `input.${config.sourceExtension}`);
      const buffer = await downloadToBuffer(inputFile.storageKey);
      await writeFile(inputPath, buffer);

      let outputPath: string;
      try {
        outputPath = await convertWithLibreOffice(inputPath, config, dir);
      } catch (error) {
        if (error instanceof JobFailure) throw error;
        throw new JobFailure("PROCESSING_FAILED");
      }

      const outputBuffer = await readFile(outputPath);
      if (outputBuffer.byteLength === 0) {
        throw new JobFailure("PROCESSING_FAILED");
      }

      const mimeType = MIME_BY_EXT[config.targetExtension] ?? "application/octet-stream";
      const storageKey = `results/${randomUUID()}.${config.targetExtension}`;
      await uploadBuffer(storageKey, outputBuffer, mimeType);

      await prisma.file.create({
        data: {
          userId: job.userId,
          guestId: job.guestId,
          storageKey,
          originalName: config.outputName,
          mimeType,
          size: outputBuffer.byteLength,
          status: "READY",
          outputJobId: job.id,
          expiresAt: computeFileExpiry(job.userId),
        },
      });
    });
  };
}
