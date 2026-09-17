import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./exec.js";
import { JobFailure } from "./errors.js";

const RUNNER_SCRIPT = fileURLToPath(new URL("./pureComputeRunner.js", import.meta.url));

/** Wall-clock budget for pdf-lib/pdfjs-dist work with no engine subprocess
 * of its own. Generous relative to how fast these operations run on a
 * legitimately-sized input (already bounded upstream by maxFileSizeBytes/
 * maxPages) -- this is a backstop against a pathological input hanging
 * the parser, not a tight performance budget. */
const DEFAULT_TIMEOUT_MS = 45_000;

interface ComputeInput {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Runs one named `pureCompute/<computeName>.ts` module in a short-lived
 * Node child process with a real wall-clock timeout + SIGKILL (via the
 * same `runCommand` every engine invocation in this codebase already
 * uses) -- see pureComputeRunner.ts for why this, not a Promise-race
 * timeout, is the honest way to bound pure-JS PDF work. Returns the
 * computed output bytes, or throws a `JobFailure` with whatever code the
 * child process reported (falling back to `PROCESSING_FAILED`).
 */
export async function runPureCompute(
  computeName: string,
  inputs: ComputeInput[],
  options: unknown,
  dir: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Buffer> {
  const inputPaths = await Promise.all(
    inputs.map(async (input, index) => {
      const path = join(dir, `input-${index}`);
      await writeFile(path, input.buffer);
      return { path, mimeType: input.mimeType };
    }),
  );

  const manifestPath = join(dir, "manifest.json");
  const outputPath = join(dir, "output.bin");
  await writeFile(manifestPath, JSON.stringify({ inputs: inputPaths, options }));

  try {
    await runCommand(process.execPath, [RUNNER_SCRIPT, computeName, manifestPath, outputPath], {
      timeoutMs,
      cwd: dir,
    });
  } catch {
    let code = "PROCESSING_FAILED";
    try {
      const errorJson = await readFile(`${outputPath}.error.json`, "utf-8");
      code = (JSON.parse(errorJson) as { code: string }).code;
    } catch {
      // No error file (e.g. a timeout SIGKILL, which never gets to write
      // one) -- the generic fallback code above is already correct.
    }
    throw new JobFailure(code);
  }

  return readFile(outputPath);
}
