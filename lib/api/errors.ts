import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "TOOL_DISABLED"
  | "GUEST_NOT_ALLOWED"
  | "DAILY_LIMIT_REACHED"
  | "TOO_MANY_FILES"
  | "TOO_MANY_PAGES"
  | "ENCRYPTED_PDF"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED"
  | "FILE_TRASHED"
  | "NOT_TRASHED";

const statusByCode: Record<ApiErrorCode, number> = {
  UNSUPPORTED_FILE: 415,
  FILE_TOO_LARGE: 413,
  TOOL_DISABLED: 404,
  GUEST_NOT_ALLOWED: 403,
  DAILY_LIMIT_REACHED: 429,
  TOO_MANY_FILES: 400,
  TOO_MANY_PAGES: 400,
  ENCRYPTED_PDF: 415,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  RATE_LIMITED: 429,
  AUTH_REQUIRED: 401,
  FILE_TRASHED: 409,
  NOT_TRASHED: 409,
};

/** Never include raw error/stack details — the message shown to the
 * client must always be one of our own safe, non-sensitive strings
 * (blueprint §46). */
export function apiError(code: ApiErrorCode) {
  return NextResponse.json({ error: { code } }, { status: statusByCode[code] });
}
