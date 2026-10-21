import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { consumeAuthToken, findValidAuthToken } from "@/lib/auth/tokens";
import { passwordMatchesEmail, passwordSchema, tokenSchema } from "@/lib/auth/validation";
import { destroyUserSessions } from "@/lib/auth/session";
import { parseAuthRequest } from "@/lib/auth/request";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const resetSchema = z.object({ token: tokenSchema, password: passwordSchema }).strict();

/**
 * Sets a new password from a reset link. The password is validated
 * *before* the token is consumed, so a rejected password doesn't burn the
 * link. On success every existing session is revoked (whoever knew the
 * old password is signed out everywhere) and the email counts as verified
 * (the user just proved they control the mailbox). The user signs in
 * again explicitly afterwards.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `reset:ip:${ip}`, limit: 20, windowSeconds: 900 }]))) {
    return apiError("RATE_LIMITED");
  }
  const parsed = await parseAuthRequest(request, resetSchema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;

  const candidateId = await findValidAuthToken(token, "PASSWORD_RESET");
  if (!candidateId) return apiError("INVALID_TOKEN");
  const user = await prisma.user.findUnique({ where: { id: candidateId } });
  if (!user || user.disabledAt) return apiError("INVALID_TOKEN");
  if (passwordMatchesEmail(password, user.email)) return apiError("VALIDATION_ERROR");

  const passwordHash = await hashPassword(password);
  // The atomic consume is the actual single-use guarantee; the lookup
  // above only lets a rejected password leave the link usable.
  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (userId !== user.id) return apiError("INVALID_TOKEN");

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
  });
  await destroyUserSessions(userId);

  return NextResponse.json({ ok: true });
}
