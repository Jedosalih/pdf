import { randomUUID } from "node:crypto";
import type { Browser } from "playwright";
import MarkdownIt from "markdown-it";
import { prisma } from "../db.js";
import { downloadToBuffer, uploadBuffer } from "../storage.js";
import { renderHtmlToPdf } from "../render.js";
import { JobFailure } from "../errors.js";
import { computeFileExpiry } from "../retention.js";

// `html: false` deliberately disables raw-HTML passthrough — a literal
// `<script>` typed into a .md file is escaped to visible text, not live
// markup. (renderHtmlToPdf's own sanitizer is still a second layer
// regardless, but this stops it earlier.)
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

// Bare markdown-it output has zero CSS and would look broken relative to
// the GitHub/Typora-style rendering users expect — this fixed,
// server-authored template is not applied to raw HTML uploads, whose
// entire point is "render my already-styled document as-is."
function wrapInTemplate(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; }
  h1, h2, h3, h4 { font-weight: 600; margin-top: 1.4em; margin-bottom: 0.5em; }
  h1 { font-size: 1.8em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }
  p { margin: 0.8em 0; }
  code { background: #f2f2f2; padding: 0.15em 0.4em; border-radius: 3px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
  pre { background: #f2f2f2; padding: 1em; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0.2em 1em; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 0.5em 0.8em; text-align: start; }
  th { background: #f7f7f7; }
  img { max-width: 100%; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function createMarkdownToPdfHandler(browser: Browser): (jobId: string) => Promise<void> {
  return async function handleMarkdownToPdf(jobId: string): Promise<void> {
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { inputFiles: true },
    });

    const inputFile = job.inputFiles[0];
    if (!inputFile) {
      throw new JobFailure("VALIDATION_ERROR");
    }

    const buffer = await downloadToBuffer(inputFile.storageKey);
    const markdown = buffer.toString("utf-8");
    const bodyHtml = md.render(markdown);
    const fullHtml = wrapInTemplate(bodyHtml);

    const pdfBuffer = await renderHtmlToPdf(browser, fullHtml);

    const storageKey = `results/${randomUUID()}.pdf`;
    await uploadBuffer(storageKey, pdfBuffer, "application/pdf");

    await prisma.file.create({
      data: {
        userId: job.userId,
        guestId: job.guestId,
        storageKey,
        originalName: "converted.pdf",
        mimeType: "application/pdf",
        size: pdfBuffer.byteLength,
        status: "READY",
        outputJobId: job.id,
        expiresAt: computeFileExpiry(job.userId),
      },
    });
  };
}
