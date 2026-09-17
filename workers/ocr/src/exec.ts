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
