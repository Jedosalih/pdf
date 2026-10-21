import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";

export const SESSION_COOKIE_NAME = "jdpdf_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
}

/**
 * Same HMAC-signing primitive as `lib/security/guestIdCore.ts`'s `sign()`,
 * reused here rather than duplicated: we only ever store `tokenHash` in the
 * `Session` table (never the raw token), so a DB leak alone can't be used
 * to forge a session cookie.
 */
function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: AUTH_SECRET");
  }
  return secret;
}

function hashToken(token: string): string {
  return crypto.createHmac("sha256", requireAuthSecret()).update(token).digest("hex");
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/",
  };
}

/**
 * Creates a DB-backed session row and returns the raw token — the caller
 * (a Route Handler) is responsible for setting it as a cookie via
 * `setSessionCookie`. The raw token is never persisted, only its HMAC hash.
 */
export async function createSession(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  return token;
}

/** Route Handlers/Server Actions only — Next.js only allows writing cookies there. */
export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, cookieOptions(SESSION_MAX_AGE_SECONDS));
}

/** Route Handlers/Server Actions only. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
}

/**
 * Pure read (cookie read + DB read, no writes) — safe to call from both
 * Route Handlers and Server Components. Returns `null` on any invalid state
 * (no cookie, unknown/expired session, disabled account) so callers can
 * fall through to guest behavior silently, matching the existing
 * `resolveActorReadOnly` contract.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.disabledAt) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
});

/** Used by logout — deletes by the raw token's hash. Idempotent (safe to call twice). */
export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Signs a user out everywhere -- after a password reset, so whoever knew
 * the old password loses any session they already had. `exceptToken`
 * keeps the caller's own session (password change while signed in). */
export async function destroyUserSessions(userId: string, exceptToken?: string | null): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId, ...(exceptToken ? { tokenHash: { not: hashToken(exceptToken) } } : {}) },
  });
}

/** Reads the raw token from the request cookie, for logout to hash+destroy. */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}
