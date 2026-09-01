import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";

interface MergeOptions {
  fileOrder?: string[];
}

export async function handleMergePdf(jobId: string): Promise<void> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { inputFiles: true },
  });

  const options = (job.options as MergeOptions | null) ?? {};
  const order = options.fileOrder ?? job.inputFiles.map((file) => file.id);
  const filesById = new Map(job.inputFiles.map((file) => [file.id, file]));
  const orderedFiles = order
    .map((id) => filesById.get(id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));

  if (orderedFiles.length < 2) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  await withTempDir(async (dir) => {
    const inputPaths: string[] = [];
    for (const [index, file] of orderedFiles.entries()) {
      const buffer = await downloadToBuffer(file.storageKey);
      const path = join(dir, `input-${index}.pdf`);
      await writeFile(path, buffer);
      inputPaths.push(path);
    }

    const outputPath = join(dir, "output.pdf");

    try {
      await runCommand(
        "qpdf",
        ["--empty", "--pages", ...inputPaths, "--", outputPath],
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
        originalName: "merged.pdf",
        mimeType: "application/pdf",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });
}
