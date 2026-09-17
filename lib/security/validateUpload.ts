import JSZip from "jszip";

/**
 * Magic-byte/file-signature checks. Never trust `file.name`/`file.type`
 * alone (blueprint §42) — every upload is verified against its actual
 * binary signature before it's accepted.
 */
const OOXML_ZIP_SIGNATURE = (buf: Buffer) =>
  buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  "application/pdf": (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/jpeg": (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/png": (buf) =>
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": OOXML_ZIP_SIGNATURE,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": OOXML_ZIP_SIGNATURE,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": OOXML_ZIP_SIGNATURE,
};

/**
 * DOCX/XLSX/PPTX all share an identical outer ZIP signature — this
 * internal marker file is what actually distinguishes them from each
 * other (and from an arbitrary ZIP renamed to look like one).
 */
const OOXML_INTERNAL_MARKERS: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word/document.xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xl/workbook.xml",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "ppt/presentation.xml",
};

/**
 * Neither Markdown nor HTML has a magic-byte signature, and browsers are
 * inconsistent about what declared MIME type they send for `.md`
 * specifically — validated by expected format (from the tool's allowed
 * types) + extension + content checks instead. Deliberately weaker than
 * the byte-signature checks above; accepted because neither format is
 * ever executed as a program or handed to a memory-unsafe native parser
 * (Markdown goes through pure-JS `markdown-it`, HTML goes through
 * Chromium's own hardened DOM/CSS parser) — see docs/SECURITY.md.
 */
const TEXT_FORMATS: Record<string, { extensions: string[]; mimes: string[] }> = {
  "text/markdown": {
    extensions: [".md", ".markdown"],
    mimes: ["text/markdown", "text/x-markdown", "text/plain", ""],
  },
  "text/html": {
    extensions: [".html", ".htm"],
    mimes: ["text/html", ""],
  },
};

export type UploadValidationError = "UNSUPPORTED_FILE" | "FILE_TOO_LARGE";

export interface ValidateUploadParams {
  buffer: Buffer;
  declaredMimeType: string;
  fileName: string;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export type ValidateUploadResult =
  | { ok: true }
  | { ok: false; error: UploadValidationError };

async function isValidOoxml(buffer: Buffer, mimeType: string): Promise<boolean> {
  const marker = OOXML_INTERNAL_MARKERS[mimeType];
  if (!marker) return false;
  try {
    const zip = await JSZip.loadAsync(buffer);
    return zip.file(marker) !== null;
  } catch {
    return false;
  }
}

function isValidTextFormat(
  buffer: Buffer,
  format: { extensions: string[] },
  fileName: string,
): boolean {
  const lowerName = fileName.toLowerCase();
  if (!format.extensions.some((ext) => lowerName.endsWith(ext))) return false;

  // Strict UTF-8 decode — rejects most renamed binaries outright.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return false;
  }

  // NUL-byte / control-byte-ratio check over a prefix — catches a renamed
  // binary that happens to decode as valid UTF-8 by coincidence.
  const sample = text.slice(0, 8192);
  let controlCount = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return false;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      controlCount += 1;
    }
  }
  if (sample.length > 0 && controlCount / sample.length > 0.02) return false;

  return true;
}

export async function validateUploadedFile(
  params: ValidateUploadParams,
): Promise<ValidateUploadResult> {
  if (params.buffer.byteLength > params.maxSizeBytes) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }
  if (params.buffer.byteLength === 0) {
    return { ok: false, error: "UNSUPPORTED_FILE" };
  }

  const textFormatEntry = Object.entries(TEXT_FORMATS).find(
    ([mime]) => params.allowedMimeTypes.includes(mime),
  );
  if (textFormatEntry) {
    const [, format] = textFormatEntry;
    if (
      format.mimes.includes(params.declaredMimeType) &&
      isValidTextFormat(params.buffer, format, params.fileName)
    ) {
      return { ok: true };
    }
    return { ok: false, error: "UNSUPPORTED_FILE" };
  }

  if (!params.allowedMimeTypes.includes(params.declaredMimeType)) {
    return { ok: false, error: "UNSUPPORTED_FILE" };
  }

  if (OOXML_INTERNAL_MARKERS[params.declaredMimeType]) {
    const signatureOk = SIGNATURES[params.declaredMimeType]?.(params.buffer) ?? false;
    if (signatureOk && (await isValidOoxml(params.buffer, params.declaredMimeType))) {
      return { ok: true };
    }
    return { ok: false, error: "UNSUPPORTED_FILE" };
  }

  const declaredCheck = SIGNATURES[params.declaredMimeType];
  if (declaredCheck?.(params.buffer)) {
    return { ok: true };
  }

  return { ok: false, error: "UNSUPPORTED_FILE" };
}
