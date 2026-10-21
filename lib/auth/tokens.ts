import crypto from "node:crypto";
import type { AuthTokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing required environment variable: AUTH_SECRET");
  return secret;
}

/** Domain-separated from session-token hashing so a value valid in one
 * table can never match the other. */
function hashAuthToken(token: string): string {
  return crypto.createHmac("sha256", requireAuthSecret()).update(`auth-token:${token}`).digest("hex");
}

/**
 * Issues a new single-use token (256 random bits, base64url) and returns
 * the raw value for the emailed link; only its HMAC is stored. Any earlier
 * unused token for the same user+purpose is deleted, so only the most
 * recent link works.
 */
export async function createAuthToken(
  userId: string,
  purpose: AuthTokenPurpose,
  ttlMs: number,
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.authToken.create({
      data: { userId, purpose, tokenHash: hashAuthToken(token), expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ]);
  return token;
}

/** Read-only: the user id of a currently valid token, without consuming
 * it -- for validating a request against its account first. */
export async function findValidAuthToken(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const row = await prisma.authToken.findFirst({
    where: { tokenHash: hashAuthToken(token), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

/**
 * Atomically marks a valid token used and returns its user id, or `null`
 * if the token is unknown, expired, already used, or for another purpose.
 * The conditional update is what makes it single-use under concurrency:
 * two simultaneous requests with the same token can't both succeed.
 */
export async function consumeAuthToken(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
  if (!token || token.length > 128) return null;
  const tokenHash = hashAuthToken(token);
  const now = new Date();
  const result = await prisma.authToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (result.count !== 1) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return row?.userId ?? null;
}
