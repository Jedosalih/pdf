import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { emailSchema } from "@/lib/auth/validation";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { migrateGuestData } from "@/lib/auth/migrateGuestData";
import { resolveActor } from "@/lib/security/actor";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

/**
 * Returns the same generic INVALID_CREDENTIALS error for an unknown email,
 * a wrong password, or a disabled account — never reveals which case it
 * was, to avoid user enumeration. Never logs the request body.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(`login:ip:${ip}`, { limit: 20, windowSeconds: 900 });
  if (!ipLimit.allowed) {
    return apiError("RATE_LIMITED");
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }
  const { email, password } = parsed.data;

  const emailLimit = await checkRateLimit(`login:email:${email}`, { limit: 5, windowSeconds: 900 });
  if (!emailLimit.allowed) {
    return apiError("RATE_LIMITED");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !passwordOk || user.disabledAt) {
    return apiError("INVALID_CREDENTIALS");
  }

  // Resolve the current actor BEFORE any session cookie is set, so a guest
  // who was uploading/processing files before logging in is identified.
  // Idempotent on an already-migrated guestId (no-op updateMany).
  const actor = await resolveActor();
  if (actor.type === "guest") {
    await migrateGuestData(actor.guestId, user.id);
  }

  const token = await createSession(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ipAddress: ip,
  });
  await setSessionCookie(token);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
