import { runCommandCaptureAll } from "./exec.js";
import { JobFailure } from "./errors.js";

/**
 * Worker half of the `maxPages` gate for tools flagged
 * `deferPageLimitToWorker` (lib/tools/types.ts): job creation couldn't
 * count the input's pages (damaged or password-protected), so it stamped
 * the actor's limit into the job options and this enforces it on the
 * now-readable output before anything is stored. A job without a stamped
 * limit (created before this existed) is left alone.
 */
export async function enforceDeferredPageLimit(pdfPath: string, options: unknown, dir: string): Promise<void> {
  const maxPages = (options as { maxPages?: unknown } | null)?.maxPages;
  if (typeof maxPages !== "number" || !Number.isFinite(maxPages)) return;

  const result = await runCommandCaptureAll("qpdf", ["--show-npages", pdfPath], { timeoutMs: 30_000, cwd: dir });
  const pages = Number.parseInt(result.stdout.trim(), 10);
  if (!Number.isFinite(pages)) throw new JobFailure("PROCESSING_FAILED");
  if (pages > maxPages) throw new JobFailure("TOO_MANY_PAGES");
}
