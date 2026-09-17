import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

/**
 * NOT routed through LibreOffice — empirically verified (see
 * docs/DECISIONS.md) that forcing a PDF into LibreOffice's Writer import
 * path and exporting to Calc's XLSX format crashes the `soffice` process
 * outright (SIGABRT inside its OOXML Calc export filter), not just
 * "low fidelity." Instead: extract text with layout preserved
 * (`pdftotext -layout`, already used by `pdf-to-text`) and reconstruct
 * rows/columns with a whitespace-run heuristic — one row per line, columns
 * split on runs of 2+ spaces. This only works well on PDFs with genuinely
 * tabular, monospaced-ish layout; documented as a real limitation in the
 * tool's own copy, not claimed as equivalent to a commercial table
 * extractor.
 */
export async function handlePdfToExcel(jobId: string): Promise<void> {
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
    const textPath = join(dir, "output.txt");
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await runCommand("pdftotext", ["-layout", inputPath, textPath], {
        timeoutMs: 60_000,
        cwd: dir,
      });
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const text = await readFile(textPath, "utf-8");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("PDF Content");

    let wroteAnyRow = false;
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      const cells = line
        .split(/ {2,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
      if (cells.length === 0) continue;
      sheet.addRow(cells);
      wroteAnyRow = true;
    }

    // A scanned/image-only PDF (no extractable text layer) produces
    // nothing meaningful this way — fail clearly rather than return a
    // technically-valid but empty spreadsheet.
    if (!wroteAnyRow) {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const mimeType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const storageKey = `results/${randomUUID()}.xlsx`;
    await uploadBuffer(storageKey, outputBuffer, mimeType);

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.xlsx",
        mimeType,
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
