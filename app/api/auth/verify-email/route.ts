import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { tokenSchema } from "@/lib/auth/validation";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { migrateGuestData } from "@/lib/auth/migrateGuestData";
import { parseAuthRequest } from "@/lib/auth/request";
import { resolveActor } from "@/lib/security/actor";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const verifySchema = z.object({ token: tokenSchema }).strict();

/**
 * Consumes a verification token (single-use, 24h) and signs the user in.
 * Deliberately a POST from the verify page's button, not a GET on the
 * emailed link: mail security scanners prefetch links, and a GET that
 * consumed the token would burn it before the user ever clicked.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `verify:ip:${ip}`, limit: 30, windowSeconds: 900 }]))) {
    return apiError("RATE_LIMITED");
  }

  const parsed = await parseAuthRequest(request, verifySchema);
  if (!parsed.ok) return parsed.response;

  const userId = await consumeAuthToken(parsed.data.token, "EMAIL_VERIFICATION");
  if (!userId) return apiError("INVALID_TOKEN");

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
  if (user.disabledAt) return apiError("INVALID_TOKEN");

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
