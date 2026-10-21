import { z } from "zod";
import { locales } from "@/lib/i18n/routing";
import { MAX_PASSWORD_BYTES, passwordByteLength } from "./password";

export const MIN_PASSWORD_LENGTH = 10;

/** A short list of the most common breached passwords that would still
 * pass the length rule (NIST SP 800-63B: reject known-compromised values).
 * Not exhaustive by design -- length does most of the work. */
const COMMON_PASSWORDS = new Set([
  "1234567890", "12345678910", "123456789a", "1q2w3e4r5t", "qwertyuiop",
  "1qaz2wsx3edc", "password12", "password123", "password1234", "passw0rd123",
  "qwerty12345", "qwerty123456", "iloveyou123", "abcdefghij", "abc1234567",
  "0987654321", "1111111111", "0000000000", "letmein123", "welcome123",
  "administrator", "superman123", "football123", "baseball123", "princess123",
  "sunshine123", "monkey12345", "dragon12345", "starwars123", "trustno1234",
]);

/**
 * `.min()`/`.max()` on a zod string count UTF-16 code units; bcrypt
 * truncates at 72 *bytes*, so the real byte length is checked instead (a
 * long Arabic/Turkish password is rejected clearly rather than silently
 * truncated by bcryptjs).
 */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH)
  .refine((value) => passwordByteLength(value) <= MAX_PASSWORD_BYTES)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()));

/** Password rules that need the account's email: it must not be the
 * email, its local part, or contain the local part. */
export function passwordMatchesEmail(password: string, email: string): boolean {
  const lowered = password.toLowerCase();
  const local = email.split("@")[0] ?? "";
  return lowered === email || (local.length >= 4 && lowered.includes(local));
}

export const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const localeSchema = z.enum(locales).optional();

/** Raw tokens are 43 base64url chars (32 random bytes). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
