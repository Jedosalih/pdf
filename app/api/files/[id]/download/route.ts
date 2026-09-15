import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { isOwnedByActor, resolveActor } from "@/lib/security/actor";
import { getStorage } from "@/lib/storage";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/**
 * Never expose storage paths directly — issue a short-lived signed URL and
 * redirect (blueprint §7, §42, §44).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) {
    return apiError("NOT_FOUND");
  }

  if (!isOwnedByActor(file, actor)) {
    return apiError("FORBIDDEN");
  }

  const url = await getStorage().getSignedDownloadUrl(file.storageKey, {
    downloadFilename: file.originalName,
    expiresInSeconds: 300,
  });

  return NextResponse.redirect(url);
}
