import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOwnedByActor, resolveActor } from "@/lib/security/actor";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/**
 * "Delete" a history entry — hides it, never actually deletes the Job row.
 * `Job.inputFiles`/`outputFiles` are `onDelete: Cascade` FROM Job, so a real
 * delete would silently cascade-destroy the user's actual files (see
 * docs/DECISIONS.md). Idempotent.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return apiError("NOT_FOUND");
  if (!isOwnedByActor(job, actor)) return apiError("FORBIDDEN");

  const updated = await prisma.job.update({
    where: { id },
    data: { hiddenAt: job.hiddenAt ?? new Date() },
  });

  return NextResponse.json({ id: updated.id, hiddenAt: updated.hiddenAt });
}
