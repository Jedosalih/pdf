import { z } from "zod";
import { MAX_PASSWORD_BYTES, passwordByteLength } from "./password";

/**
 * `.max(72)` on a zod string counts UTF-16 code units, which under-counts
 * multi-byte UTF-8 characters (e.g. Arabic/Turkish) relative to bcrypt's
 * actual 72-*byte* truncation limit — validate the real byte length instead
 * so a long non-Latin password is rejected with a clear error rather than
 * silently truncated by bcryptjs.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((value) => passwordByteLength(value) <= MAX_PASSWORD_BYTES, {
    message: "Password is too long.",
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email();
