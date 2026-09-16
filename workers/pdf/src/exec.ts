import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * The only way engine binaries are ever invoked: a fixed command with an
 * argument array, never a shell string (blueprint §6, docs/SECURITY.md).
 */
export async function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; cwd?: string },
): Promise<void> {
  await execFileAsync(command, args, {
    timeout: options?.timeoutMs ?? 60_000,
    cwd: options?.cwd,
    killSignal: "SIGKILL",
  });
}

/** Same safety contract as `runCommand`, but returns stdout for engines
 * that report information rather than write a file (e.g. `qpdf
 * --show-npages`). */
export async function runCommandCapture(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; cwd?: string },
): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    timeout: options?.timeoutMs ?? 60_000,
    cwd: options?.cwd,
    killSignal: "SIGKILL",
  });
  return stdout.toString().trim();
}

/**
 * Never throws — returns combined stdout+stderr text regardless of exit
 * code. Needed for engines (Ghostscript's repair path, notably) that
 * report a real "gave up" failure only in diagnostic text while still
 * exiting 0, so a caller must inspect the text itself rather than rely on
 * the exit code alone.
 */
export async function runCommandCaptureAll(
  command: string,
  args: string[],
  options?: { timeoutMs?: number; cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options?.timeoutMs ?? 60_000,
      cwd: options?.cwd,
      killSignal: "SIGKILL",
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: typeof err.code === "number" ? err.code : null,
    };
  }
}
