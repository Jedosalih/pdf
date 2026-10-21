import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { destroyUserSessions, getSessionUser, readSessionToken } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordMatchesEmail, passwordSchema } from "@/lib/auth/validation";
import { parseAuthRequest } from "@/lib/auth/request";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: passwordSchema.optional(),
  })
  .strict()
  .refine((data) => !data.newPassword || Boolean(data.currentPassword), {
    message: "currentPassword is required when changing the password",
  });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("AUTH_REQUIRED");
  return NextResponse.json(user);
}

/** Profile name edit and/or password change (requires the current
 * password; signs out every *other* session on success). */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return apiError("AUTH_REQUIRED");

  const parsed = await parseAuthRequest(request, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { name, currentPassword, newPassword } = parsed.data;

  if (newPassword) {
    if (!(await checkRateLimits([{ key: `password-change:${user.id}`, limit: 10, windowSeconds: 900 }]))) {
      return apiError("RATE_LIMITED");
    }
    if (passwordMatchesEmail(newPassword, user.email)) return apiError("VALIDATION_ERROR");
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const valid = dbUser?.passwordHash
      ? await verifyPassword(currentPassword as string, dbUser.passwordHash)
      : false;
    if (!valid) return apiError("INVALID_CREDENTIALS");

    await prisma.user.update({
      where: { id: user.id },
      data: { ...(name !== undefined ? { name } : {}), passwordHash: await hashPassword(newPassword) },
    });
    await destroyUserSessions(user.id, await readSessionToken());
  } else if (name !== undefined) {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
  }

  return NextResponse.json({ ok: true });
}
