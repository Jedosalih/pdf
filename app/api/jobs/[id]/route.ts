import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolveActor } from "@/lib/security/actor";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const job = await prisma.job.findUnique({
    where: { id },
    include: { outputFiles: true },
  });

  if (!job) {
    return apiError("NOT_FOUND");
  }

  const isOwner =
    actor.type === "guest"
      ? job.guestId === actor.guestId
      : job.userId === actor.userId;
  if (!isOwner) {
    return apiError("FORBIDDEN");
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    errorCode: job.errorCode,
    outputFiles: job.outputFiles.map((file) => ({
      id: file.id,
      name: file.originalName,
      size: file.size,
    })),
  });
}
