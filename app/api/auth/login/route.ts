import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { emailSchema } from "@/lib/auth/validation";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { migrateGuestData } from "@/lib/auth/migrateGuestData";
import { parseAuthRequest } from "@/lib/auth/request";
import { resolveActor } from "@/lib/security/actor";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();

/** Compared against when the email has no account, so an unknown email
 * costs the same bcrypt time as a wrong password (no timing oracle). */
let dummyHash: Promise<string> | undefined;

/**
 * Returns the same INVALID_CREDENTIALS for an unknown email, a wrong
 * password, or a disabled account. EMAIL_NOT_VERIFIED is only returned
 * after the correct password, so it reveals nothing to someone who
 * doesn't already know it. A brand-new session token is issued on every
 * login (no session fixation). Never logs the request body.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `login:ip:${ip}`, limit: 20, windowSeconds: 900 }]))) {
    return apiError("RATE_LIMITED");
  }

  const parsed = await parseAuthRequest(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password } = parsed.data;

  if (!(await checkRateLimits([{ key: `login:email:${email}`, limit: 10, windowSeconds: 900 }]))) {
    return apiError("RATE_LIMITED");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

  if (!user || !user.passwordHash || !passwordOk || user.disabledAt) {
    return apiError("INVALID_CREDENTIALS");
  }
  if (!user.emailVerifiedAt) {
    return apiError("EMAIL_NOT_VERIFIED");
  }

  // Resolve the current actor BEFORE any session cookie is set, so a guest
  // who was uploading/processing files before logging in is identified.
  // Idempotent on an already-migrated guestId (no-op updateMany).
  const actor = await resolveActor();
  if (actor.type === "guest") {
    await migrateGuestData(actor.guestId, user.id);
  }

  const token = await createSession(user.id, {
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? undefined,
    ipAddress: ip,
  });
  await setSessionCookie(token);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
