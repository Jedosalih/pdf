import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";
import { decryptWithPassword } from "../qpdfJob.js";
import { enforceDeferredPageLimit } from "../pageLimit.js";

interface UnlockOptions {
  password?: string;
}

interface ExecError {
  stderr?: string;
}

const MAX_PASSWORD_LENGTH = 200;

export async function handleUnlockPdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const inputFile = job.inputFiles[0];
  if (!inputFile) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  const options = (job.options as UnlockOptions | null) ?? {};
  const password = typeof options.password === "string" ? options.password : "";
  if (!password || password.length > MAX_PASSWORD_LENGTH || password.includes("\0")) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPath = join(dir, "input.pdf");
    const outputPath = join(dir, "output.pdf");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await decryptWithPassword(inputPath, outputPath, password, dir);
    } catch (error) {
      // qpdf's own message for a wrong password mentions "password"; any
      // other failure (e.g. the file isn't encrypted at all, or is
      // corrupt) is a distinct, non-password error.
      const stderr = (error as ExecError).stderr ?? "";
      if (/password/i.test(stderr)) {
        throw new JobFailure("INVALID_PASSWORD");
      }
      throw new JobFailure("PROCESSING_FAILED");
    }

    await enforceDeferredPageLimit(outputPath, job.options, dir);

    const outputBuffer = await readFile(outputPath);
    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, outputBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "unlocked.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
