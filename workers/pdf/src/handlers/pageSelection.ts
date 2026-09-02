import { runCommand, runCommandCapture } from "../exec.js";
import { JobFailure } from "../errors.js";

/** Shared by Delete/Extract/Reorder Pages — all three ultimately reduce to
 * "produce a new PDF from this exact 1-indexed page list, in this order." */
export async function getPageCount(inputPath: string, cwd: string): Promise<number> {
  let output: string;
  try {
    output = await runCommandCapture("qpdf", ["--show-npages", inputPath], {
      timeoutMs: 30_000,
      cwd,
    });
  } catch {
    throw new JobFailure("PROCESSING_FAILED");
  }
  const totalPages = Number.parseInt(output, 10);
  if (!Number.isFinite(totalPages) || totalPages < 1) {
    throw new JobFailure("PROCESSING_FAILED");
  }
  return totalPages;
}

export async function extractPages(
  inputPath: string,
  outputPath: string,
  pageNumbers: number[],
  cwd: string,
): Promise<void> {
  if (pageNumbers.length === 0) {
    throw new JobFailure("VALIDATION_ERROR");
  }

  try {
    await runCommand(
      "qpdf",
      [inputPath, "--pages", inputPath, pageNumbers.join(","), "--", outputPath],
      { timeoutMs: 60_000, cwd },
    );
  } catch {
    throw new JobFailure("PROCESSING_FAILED");
  }
}
