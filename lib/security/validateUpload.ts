/**
 * Magic-byte/file-signature checks. Never trust `file.name`/`file.type`
 * alone (blueprint §42) — every upload is verified against its actual
 * binary signature before it's accepted.
 */
const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  "application/pdf": (buf) => buf.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/jpeg": (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/png": (buf) =>
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

export type UploadValidationError = "UNSUPPORTED_FILE" | "FILE_TOO_LARGE";

export interface ValidateUploadParams {
  buffer: Buffer;
  declaredMimeType: string;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export type ValidateUploadResult =
  | { ok: true }
  | { ok: false; error: UploadValidationError };

export function validateUploadedFile(
  params: ValidateUploadParams,
): ValidateUploadResult {
  if (params.buffer.byteLength > params.maxSizeBytes) {
    return { ok: false, error: "FILE_TOO_LARGE" };
  }
  if (params.buffer.byteLength === 0) {
    return { ok: false, error: "UNSUPPORTED_FILE" };
  }

  const declaredCheck = SIGNATURES[params.declaredMimeType];
  if (
    params.allowedMimeTypes.includes(params.declaredMimeType) &&
    declaredCheck?.(params.buffer)
  ) {
    return { ok: true };
  }

  return { ok: false, error: "UNSUPPORTED_FILE" };
}
