/**
 * Runs protect/unlock (src/qpdfJob.ts) against the real qpdf binary with
 * passwords designed to be misparsed as options or mangled. Run inside the
 * pdf-worker image:
 *
 *   docker compose run --rm --no-deps pdf-worker node dist/qpdfJob.test.js
 *
 * Passwords are test values only and are never logged by the handlers.
 */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { runCommandCaptureAll } from "./exec.js";
import { decryptWithPassword, encryptWithPassword } from "./qpdfJob.js";
import { withTempDir } from "./tempDir.js";

const PASSWORDS = [
  "--help",
  "--decrypt",
  "--",
  "-",
  "-x",
  "--show-npages",
  "@args.txt",
  "pass word",
  "  leading-and-trailing  ",
  "a=b=c",
  "\"quotes' and `ticks` \\ backslash",
  "ünïcødé-şğı-كلمة",
  "x".repeat(127),
];

async function main() {
  let failures = 0;
  await withTempDir(async (dir) => {
    const source = await PDFDocument.create();
    source.addPage([200, 200]);
    const sourcePath = join(dir, "plain.pdf");
    await writeFile(sourcePath, await source.save());

    for (const [index, password] of PASSWORDS.entries()) {
      const label = `password #${index} (${password.length} chars)`;
      try {
        const encrypted = join(dir, `enc-${index}.pdf`);
        await encryptWithPassword(sourcePath, encrypted, password, dir);

        const isEncrypted = await runCommandCaptureAll("qpdf", ["--is-encrypted", encrypted]);
        assert.equal(isEncrypted.exitCode, 0, "output is not encrypted");
        const noPassword = await runCommandCaptureAll("qpdf", ["--requires-password", encrypted]);
        assert.equal(noPassword.exitCode, 0, "output opens without a password");

        // Differs within the first 127 bytes -- AES-256 ignores anything after.
        const wrongPassword = (password.startsWith("Z") ? "Y" : "Z") + password.slice(1);
        await assert.rejects(
          decryptWithPassword(encrypted, join(dir, `wrong-${index}.pdf`), wrongPassword, dir),
          "a wrong password was accepted",
        );

        const decrypted = join(dir, `dec-${index}.pdf`);
        await decryptWithPassword(encrypted, decrypted, password, dir);
        const stillEncrypted = await runCommandCaptureAll("qpdf", ["--is-encrypted", decrypted]);
        assert.equal(stillEncrypted.exitCode, 2, "decrypted output is still encrypted");
        console.log(`PASS ${label}`);
      } catch (error) {
        failures += 1;
        console.log(`FAIL ${label}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      }
    }
  });

  if (failures > 0) {
    console.log(`\n${failures} password case(s) failed`);
    process.exit(1);
  }
  console.log("\nall qpdf password checks passed");
}

void main();
