import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/validation";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine((data) => !data.newPassword || Boolean(data.currentPassword), {
    message: "currentPassword is required when changing the password",
  });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("AUTH_REQUIRED");
  return NextResponse.json(user);
}

/** Profile name edit and/or password change (requires the current password). */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return apiError("AUTH_REQUIRED");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR");
  const { name, currentPassword, newPassword } = parsed.data;

  if (newPassword) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const valid = dbUser?.passwordHash
      ? await verifyPassword(currentPassword as string, dbUser.passwordHash)
      : false;
    if (!valid) return apiError("INVALID_CREDENTIALS");

    await prisma.user.update({
      where: { id: user.id },
      data: { ...(name !== undefined ? { name } : {}), passwordHash: await hashPassword(newPassword) },
    });
  } else if (name !== undefined) {
    await prisma.user.update({ where: { id: user.id }, data: { name } });
  }

  return NextResponse.json({ ok: true });
}
