import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommandCaptureAll } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

// Ghostscript's own repair path exits 0 even when it fails to reconstruct a
// usable document — these are the diagnostic phrases it emits when it gave
// up rather than genuinely recovering the file (verified empirically
// against real corrupted fixtures in the running container, not assumed;
// see docs/DECISIONS.md). Exit code alone cannot distinguish "repaired"
// from "produced an empty shell".
const GS_GAVE_UP_PHRASES = [
  "Couldn't initialise file",
  "Catalog dictionary not located",
  "couldn't repair PDF file",
  "No pages will be processed",
];

async function tryQpdfRepair(inputPath: string, outputPath: string, dir: string): Promise<boolean> {
  const { exitCode } = await runCommandCaptureAll("qpdf", [inputPath, outputPath], {
    timeoutMs: 60_000,
    cwd: dir,
  });
  // qpdf exits 0 (clean) or 3 ("succeeded with warnings" — a genuinely
  // repaired file was still written); any other code (2: couldn't recover
  // at all) means no output file exists.
  return exitCode === 0 || exitCode === 3;
}

async function tryGhostscriptRepair(inputPath: string, outputPath: string, dir: string): Promise<boolean> {
  const { stdout, stderr } = await runCommandCaptureAll(
    "gs",
    ["-o", outputPath, "-sDEVICE=pdfwrite", inputPath],
    { timeoutMs: 120_000, cwd: dir },
  );
  const combined = `${stdout}\n${stderr}`;
  return !GS_GAVE_UP_PHRASES.some((phrase) => combined.includes(phrase));
}

async function verifyRepaired(outputPath: string, dir: string): Promise<boolean> {
  const check = await runCommandCaptureAll("qpdf", ["--check", outputPath], {
    timeoutMs: 30_000,
    cwd: dir,
  });
  // --check exits 0 (clean) or 3 (warnings only, still a usable file);
  // exit 2 means the "repaired" output is itself still broken.
  if (check.exitCode !== 0 && check.exitCode !== 3) return false;

  const pages = await runCommandCaptureAll("qpdf", ["--show-npages", outputPath], {
    timeoutMs: 30_000,
    cwd: dir,
  });
  const pageCount = Number.parseInt(pages.stdout.trim(), 10);
  return Number.isFinite(pageCount) && pageCount > 0;
}

export async function handleRepairPdf(jobId: string): Promise<void> {
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
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    const qpdfSucceeded = await tryQpdfRepair(inputPath, outputPath, dir);
    if (!qpdfSucceeded) {
      const gsSucceeded = await tryGhostscriptRepair(inputPath, outputPath, dir);
      if (!gsSucceeded) {
        throw new JobFailure("UNRECOVERABLE_FILE");
      }
    }

    const verified = await verifyRepaired(outputPath, dir);
    if (!verified) {
      throw new JobFailure("UNRECOVERABLE_FILE");
    }

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "repaired.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
