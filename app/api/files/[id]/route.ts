import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { isOwnedByActor, resolveActor } from "@/lib/security/actor";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    originalName: z.string().trim().min(1).max(255).optional(),
    starred: z.boolean().optional(),
  })
  .refine((data) => data.originalName !== undefined || data.starred !== undefined, {
    message: "At least one field must be provided.",
  });

/** Rename and/or star/unstar a file. Blocked while trashed — restore first. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return apiError("NOT_FOUND");
  if (!isOwnedByActor(file, actor)) return apiError("FORBIDDEN");
  if (file.deletedAt) return apiError("FILE_TRASHED");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }

  const updated = await prisma.file.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({
    id: updated.id,
    originalName: updated.originalName,
    starred: updated.starred,
  });
}

/**
 * Permanent delete — only reachable once a file is already trashed (forces
 * the two-step trash-then-delete flow, so this can't be triggered directly
 * from the Documents view by accident). Best-effort storage delete: a
 * storage-provider failure shouldn't block the user's explicit delete
 * request (no cleanup worker exists yet to retry it either way).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return apiError("NOT_FOUND");
  if (!isOwnedByActor(file, actor)) return apiError("FORBIDDEN");
  if (!file.deletedAt) return apiError("NOT_TRASHED");

  try {
    await getStorage().deleteObject(file.storageKey);
  } catch {
    // Best-effort — proceed with the DB delete regardless.
  }
  await prisma.file.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
