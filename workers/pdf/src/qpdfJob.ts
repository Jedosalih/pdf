import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./exec.js";

/**
 * Runs qpdf operations that carry a user-supplied password through a qpdf
 * job JSON file (`--job-json-file`) instead of argv. qpdf 11.3 (Debian
 * bookworm) only accepts encryption passwords positionally
 * (`--encrypt <user> <owner> <bits> --`) and parses any argument starting
 * with `-` as an option, so a password such as `--help` or `-` cannot be
 * passed safely on the command line at all. As a JSON string value it is
 * never parsed as anything but data -- and it also stays out of the
 * process list. The file lives in the job's private temp dir
 * (withTempDir removes it on every path) and is never logged.
 */
async function runQpdfJob(job: Record<string, unknown>, dir: string, timeoutMs: number): Promise<void> {
  const jobPath = join(dir, `qpdf-job-${randomUUID()}.json`);
  await writeFile(jobPath, JSON.stringify(job), { mode: 0o600 });
  await runCommand("qpdf", [`--job-json-file=${jobPath}`], { timeoutMs, cwd: dir });
}

export function encryptWithPassword(
  inputPath: string,
  outputPath: string,
  password: string,
  dir: string,
  timeoutMs = 60_000,
): Promise<void> {
  return runQpdfJob(
    {
      inputFile: inputPath,
      outputFile: outputPath,
      encrypt: { userPassword: password, ownerPassword: password, "256bit": {} },
    },
    dir,
    timeoutMs,
  );
}

export function decryptWithPassword(
  inputPath: string,
  outputPath: string,
  password: string,
  dir: string,
  timeoutMs = 60_000,
): Promise<void> {
  return runQpdfJob({ inputFile: inputPath, outputFile: outputPath, password, decrypt: "" }, dir, timeoutMs);
}
