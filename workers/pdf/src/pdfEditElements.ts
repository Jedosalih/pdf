import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

type RawEdit = Record<string, unknown>;

// The client sends arbitrary JSON (the job API only validates it's an
// object, see app/api/jobs/route.ts) -- every field here is independently
// bounds-checked rather than trusted, the same way watermarkPdf.ts treats
// its own options. Shared by editPdf.ts (freeform annotation editing) and
// fillSignPdf.ts (signature/text placement), which both let a client
// describe the same five overlay element shapes.
const MAX_EDITS = 300;
const MAX_TEXT_LENGTH = 2000;
const MAX_PATH_POINTS = 2000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 20_000;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseColor(value: unknown): { r: number; g: number; b: number } {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16) / 255,
      g: parseInt(value.slice(3, 5), 16) / 255,
      b: parseInt(value.slice(5, 7), 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * Draws a batch of overlay edits (text/image/rectangle/highlight/freehand
 * path) as real, new page content via pdf-lib -- this adds genuine
 * content-stream objects, it does not modify or claim to modify any
 * pre-existing text in place. Returns how many edits were actually
 * applied, so callers can treat "zero elements survived validation" as a
 * failure rather than silently shipping an unchanged file.
 */
export async function applyEditElements(
  pdfDoc: PDFDocument,
  rawEdits: unknown[],
): Promise<number> {
  if (rawEdits.length > MAX_EDITS) {
    return 0;
  }

  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let appliedCount = 0;

  for (const raw of rawEdits) {
    if (!raw || typeof raw !== "object") continue;
    const edit = raw as RawEdit;

    const pageIndex = num(edit.page);
    if (pageIndex === null || pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex]!;
    const { height: pageHeight } = page.getSize();

    // All coordinates arrive in PDF-point units with a top-left origin
    // (matching the client's on-screen overlay) -- pdfY converts to
    // pdf-lib's bottom-left-origin space for the primitives that take a
    // literal y (text/rect/image). drawSvgPath is handled separately: it
    // flips the path's own y-axis internally, so its points must stay
    // top-down and only the anchor (x, pageHeight) is bottom-left-space.
    const x = num(edit.x);
    const y = num(edit.y);
    const width = num(edit.width);
    const height = num(edit.height);

    if (edit.type === "path") {
      const points = Array.isArray(edit.points) ? (edit.points as unknown[]) : [];
      const valid: { x: number; y: number }[] = [];
      for (const p of points.slice(0, MAX_PATH_POINTS)) {
        if (!p || typeof p !== "object") continue;
        const px = num((p as RawEdit).x);
        const py = num((p as RawEdit).y);
        if (px === null || py === null) continue;
        valid.push({ x: px, y: py });
      }
      if (valid.length < 2) continue;
      const color = parseColor(edit.color);
      const strokeWidth = Math.max(1, Math.min(40, num(edit.strokeWidth) ?? 3));
      const svgPath = valid.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      page.drawSvgPath(svgPath, {
        x: 0,
        y: pageHeight,
        borderColor: rgb(color.r, color.g, color.b),
        borderWidth: strokeWidth,
      });
      appliedCount += 1;
      continue;
    }

    if (x === null || y === null || width === null || height === null) continue;
    if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) continue;
    const pdfY = pageHeight - y - height;

    switch (edit.type) {
      case "text": {
        const text = typeof edit.text === "string" ? edit.text.slice(0, MAX_TEXT_LENGTH) : "";
        if (!text.trim()) continue;
        const fontSize = Math.max(4, Math.min(400, num(edit.fontSize) ?? 16));
        const color = parseColor(edit.color);
        const font: PDFFont = edit.bold === true ? helveticaBold : helvetica;
        page.drawText(text, {
          x,
          y: pdfY + Math.max(0, height - fontSize),
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          maxWidth: width,
          lineHeight: fontSize * 1.2,
        });
        appliedCount += 1;
        break;
      }
      case "rect": {
        const color = parseColor(edit.color);
        const opacity = Math.max(0, Math.min(1, num(edit.opacity) ?? 1));
        const filled = edit.fill !== false;
        page.drawRectangle({
          x,
          y: pdfY,
          width,
          height,
          color: filled ? rgb(color.r, color.g, color.b) : undefined,
          opacity: filled ? opacity : undefined,
          borderColor: rgb(color.r, color.g, color.b),
          borderWidth: filled ? 0 : Math.max(1, Math.min(20, num(edit.strokeWidth) ?? 2)),
          borderOpacity: filled ? undefined : opacity,
        });
        appliedCount += 1;
        break;
      }
      case "highlight": {
        const color = parseColor(edit.color);
        page.drawRectangle({
          x,
          y: pdfY,
          width,
          height,
          color: rgb(color.r, color.g, color.b),
          opacity: 0.4,
        });
        appliedCount += 1;
        break;
      }
      case "image": {
        const dataUrl = typeof edit.image === "string" ? edit.image : "";
        const match = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!match) continue;
        const mime = match[1];
        const base64 = match[2]!;
        const bytes = Buffer.from(base64, "base64");
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) continue;
        try {
          const embedded =
            mime === "image/png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
          page.drawImage(embedded, { x, y: pdfY, width, height });
          appliedCount += 1;
        } catch {
          continue;
        }
        break;
      }
      default:
        continue;
    }
  }

  return appliedCount;
}
