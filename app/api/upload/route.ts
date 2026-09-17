import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import { getToolLimits } from "@/lib/entitlements";
import { computeExpiry } from "@/lib/entitlements/retention";
import { resolveActor } from "@/lib/security/actor";
import { validateUploadedFile } from "@/lib/security/validateUpload";
import { generateStorageKey, getStorage } from "@/lib/storage";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

/**
 * Accepts one file per request (multipart/form-data: `file`, `toolId`).
 * Heavy processing never happens here — this route only validates,
 * persists, and returns a fileId for a later job-creation call
 * (see docs/ARCHITECTURE.md).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const toolId = formData.get("toolId");

  if (!(file instanceof File) || typeof toolId !== "string") {
    return apiError("VALIDATION_ERROR");
  }

  const tool = getToolById(toolId);
  if (!tool || !tool.enabled) {
    return apiError("TOOL_DISABLED");
  }

  const actor = await resolveActor();
  if (actor.type === "guest" && !tool.guestEnabled) {
    return apiError("GUEST_NOT_ALLOWED");
  }

  const limits = await getToolLimits(actor, toolId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const validation = await validateUploadedFile({
    buffer,
    declaredMimeType: file.type,
    fileName: file.name,
    allowedMimeTypes: tool.inputTypes,
    maxSizeBytes: limits.maxFileSizeBytes,
  });
  if (!validation.ok) {
    return apiError(validation.error);
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop()! : "";
  const storageKey = generateStorageKey("uploads", extension);
  await getStorage().putObject(storageKey, buffer, file.type);

  const fileRecord = await prisma.file.create({
    data: {
      userId: actor.type === "user" ? actor.userId : null,
      guestId: actor.type === "guest" ? actor.guestId : null,
      storageKey,
      originalName: file.name,
      mimeType: file.type,
      size: buffer.byteLength,
      status: "UPLOADED",
      expiresAt: computeExpiry(actor),
    },
  });

  return NextResponse.json({
    fileId: fileRecord.id,
    name: fileRecord.originalName,
    size: fileRecord.size,
  });
}
