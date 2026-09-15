import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { emailSchema, passwordSchema } from "@/lib/auth/validation";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { migrateGuestData } from "@/lib/auth/migrateGuestData";
import { resolveActor } from "@/lib/security/actor";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100).optional(),
});

/**
 * Never logs the request body (contains a password) — only structured
 * error codes are returned to the client (blueprint §46).
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(`register:${ip}`, { limit: 20, windowSeconds: 900 });
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED");
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return apiError("EMAIL_TAKEN");
  }

  // Resolve the current actor BEFORE any session cookie is set, so a guest
  // who was uploading/processing files before signing up is identified.
  const actor = await resolveActor();

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

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
