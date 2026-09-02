import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand, runCommandCapture } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";

interface SplitOptions {
  everyNPages?: number;
}

const MAX_PARTS = 200;

export async function handleSplitPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as SplitOptions | null) ?? {};
  const everyN = Math.floor(options.everyNPages ?? 1);
  if (!Number.isFinite(everyN) || everyN < 1) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    let totalPages: number;
    try {
      const output = await runCommandCapture("qpdf", ["--show-npages", inputPath], {
        timeoutMs: 30_000,
        cwd: dir,
      });
      totalPages = Number.parseInt(output, 10);
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    if (!Number.isFinite(totalPages) || totalPages < 1) {
      throw new JobFailure("PROCESSING_FAILED");
    }
    if (everyN >= totalPages) {
      // Nothing to split — the whole document is already <= one chunk.
      throw new JobFailure("VALIDATION_ERROR");
    }

    const partCount = Math.ceil(totalPages / everyN);
    if (partCount > MAX_PARTS) {
      throw new JobFailure("TOO_MANY_PAGES");
    }

    for (let part = 0; part < partCount; part += 1) {
      const start = part * everyN + 1;
      const end = Math.min(start + everyN - 1, totalPages);
      const outputPath = join(dir, `part-${part}.pdf`);

      try {
        await runCommand(
          "qpdf",
          [inputPath, "--pages", inputPath, `${start}-${end}`, "--", outputPath],
          { timeoutMs: 60_000, cwd: dir },
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
          originalName: `split-part-${part + 1}.pdf`,
          mimeType: "application/pdf",
          size: outputBuffer.byteLength,
          status: "READY",
          outputJobId: job.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
  });
}
