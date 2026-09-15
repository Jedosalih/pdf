import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * bcrypt truncates the input at 72 *bytes*, not 72 characters — a multi-byte
 * UTF-8 password (Arabic/Turkish) can hit that limit well under 72 characters.
 * Callers must validate this (see `lib/auth/validation.ts`) before calling
 * `hashPassword`; this is just the shared byte-length check both the zod
 * schema and this module rely on.
 */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
