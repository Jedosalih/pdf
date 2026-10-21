import { readFile, writeFile } from "node:fs/promises";

/**
 * Entry point for a short-lived Node child process that does one pure,
 * CPU-bound pdf-lib/pdfjs-dist computation and exits -- the same
 * "subprocess with a timeout and SIGKILL" safety shape every other engine
 * in this codebase already gets from `runCommand` (see exec.ts), applied
 * to our own in-house JS "engine" instead of qpdf/Ghostscript/poppler.
 *
 * This exists because a `Promise.race`-based timeout cannot actually stop
 * synchronous, CPU-bound work: Node is single-threaded, so a timer
 * callback can't even run until the current synchronous block yields --
 * by the time a race-based "timeout" fires, the dangerous part is either
 * already done or still silently running forever in the background. A
 * real OS-level SIGKILL on a genuinely separate process is the only
 * honest way to bound this. See docs/DECISIONS.md and docs/SECURITY.md §3.
 *
 * argv: [<node>, <this file>, <computeName>, <manifestPath>, <outputPath>]
 * manifest JSON: { inputs: { path: string, mimeType: string }[], options: unknown }
 * On success: writes the result bytes to outputPath, exits 0.
 * On failure: writes { code: string } as JSON to `${outputPath}.error.json`,
 * exits 1. An uncaught crash (no error file) is treated as a generic
 * failure by the caller.
 */

const ALLOWED_COMPUTES = new Set([
  "pageNumbers",
  "watermarkPdf",
  "pdfMetadata",
  "imageToPdf",
  "editPdf",
  "fillSignPdf",
  "pdfToMarkdown",
  "redactAssemble",
]);

interface Manifest {
  inputs: { path: string; mimeType: string }[];
  options: unknown;
}

async function main() {
  const [, , computeName, manifestPath, outputPath] = process.argv;
  if (!computeName || !manifestPath || !outputPath || !ALLOWED_COMPUTES.has(computeName)) {
    process.stderr.write("pureComputeRunner: invalid arguments\n");
    process.exit(1);
  }

  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
    const mod = (await import(`./pureCompute/${computeName}.js`)) as {
      compute: (inputs: Manifest["inputs"], options: unknown) => Promise<Buffer>;
    };
    const result = await mod.compute(manifest.inputs, manifest.options);
    await writeFile(outputPath, result);
    process.exit(0);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "PROCESSING_FAILED";
    await writeFile(`${outputPath}.error.json`, JSON.stringify({ code }));
    process.stderr.write(`pureComputeRunner: ${computeName} failed: ${String(error)}\n`);
    process.exit(1);
  }
}

void main();
