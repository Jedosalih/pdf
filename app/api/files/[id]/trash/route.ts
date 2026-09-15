import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOwnedByActor, resolveActor } from "@/lib/security/actor";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/** Soft-delete (move to Trash). Idempotent. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return apiError("NOT_FOUND");
  if (!isOwnedByActor(file, actor)) return apiError("FORBIDDEN");

  const updated = await prisma.file.update({
    where: { id },
    data: { deletedAt: file.deletedAt ?? new Date() },
  });

  return NextResponse.json({ id: updated.id, deletedAt: updated.deletedAt });
}
