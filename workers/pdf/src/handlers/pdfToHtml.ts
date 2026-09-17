import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { runCommand } from "../exec.js";
import { withTempDir } from "../tempDir.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * `pdftohtml -noframes` (poppler-utils, already installed for pdf-to-text/
 * pdf-to-pdfa) writes one `<base>.html` plus a sibling image file per
 * embedded raster (`<base>-N_M.png`/`.jpg`), referenced by a relative
 * `src="..."` -- verified empirically against the real container, not
 * assumed. That's two files for one logical "PDF to HTML" job, which
 * doesn't fit this codebase's one-output-file-per-job model, so every
 * sibling image is inlined as a base64 data URI before upload, producing a
 * single genuinely self-contained `.html` file. This preserves reading-
 * order text and embedded images; it does not reproduce exact visual
 * layout (no absolute positioning) -- an honest, stated scope limit, not
 * an oversight (poppler's `-c`/complex mode does attempt pixel layout via
 * absolute positioning, but produces far less readable/editable HTML for
 * the common case, so the simple mode is used deliberately).
 */
export async function handlePdfToHtml(jobId: string): Promise<void> {
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
    const outputBase = "document";
    const outputHtmlPath = join(dir, `${outputBase}.html`);
    const buffer = await downloadToBuffer(inputFile.storageKey);
    await writeFile(inputPath, buffer);

    try {
      await runCommand("pdftohtml", ["-noframes", "-q", inputPath, outputBase], {
        timeoutMs: 60_000,
        cwd: dir,
      });
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    let html: string;
    try {
      html = await readFile(outputHtmlPath, "utf-8");
    } catch {
      throw new JobFailure("PROCESSING_FAILED");
    }

    const siblingFiles = (await readdir(dir)).filter((name) =>
      name.startsWith(`${outputBase}-`),
    );
    for (const name of siblingFiles) {
      const ext = extname(name).toLowerCase();
      const mime = IMAGE_MIME_BY_EXT[ext];
      if (!mime) continue;
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const srcPattern = new RegExp(`src="${escapedName}"`, "g");
      if (!srcPattern.test(html)) continue;
      const imageBytes = await readFile(join(dir, name));
      const dataUri = `data:${mime};base64,${imageBytes.toString("base64")}`;
      html = html.replace(srcPattern, `src="${dataUri}"`);
    }

    const outputBuffer = Buffer.from(html, "utf-8");
    const storageKey = `results/${randomUUID()}.html`;
    await uploadBuffer(storageKey, outputBuffer, "text/html");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.html",
        mimeType: "text/html",
        size: outputBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  });
}
