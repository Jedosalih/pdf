import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import { getToolLimits } from "@/lib/entitlements";
import { computeExpiry } from "@/lib/entitlements/retention";
import { resolveActor } from "@/lib/security/actor";
import { validateUploadedFile } from "@/lib/security/validateUpload";
import { scanFile } from "@/lib/security/scan";
import { generateStorageKey, getStorage } from "@/lib/storage";
import { apiError } from "@/lib/api/errors";
import { allowUploadRequest } from "@/lib/security/abuseLimits";
import { readBodyWithLimit } from "@/lib/security/requestBody";

export const runtime = "nodejs";

/** Room for the multipart boundaries/part headers around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Accepts one file per request (`POST /api/upload?toolId=<id>`,
 * multipart/form-data with a `file` part). `toolId` is in the query
 * string, not the form, so the actor's real per-tool size limit is known
 * before a single body byte is read -- the body is then read with a hard
 * cap (lib/security/requestBody.ts) instead of `request.formData()`
 * buffering whatever the client sends. Heavy processing never happens
 * here — this route only validates, persists, and returns a fileId for a
 * later job-creation call (see docs/ARCHITECTURE.md).
 */
export async function POST(request: NextRequest) {
  const toolId = request.nextUrl.searchParams.get("toolId");
  if (!toolId) {
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

  if (!(await allowUploadRequest(request, actor))) {
    return apiError("RATE_LIMITED");
  }

  const limits = await getToolLimits(actor, toolId);
  const body = await readBodyWithLimit(request, limits.maxFileSizeBytes + MULTIPART_OVERHEAD_BYTES);
  if (!body) {
    return apiError("FILE_TOO_LARGE");
  }

  let formData: FormData;
  try {
    formData = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: new Uint8Array(body),
    }).formData();
  } catch {
    return apiError("VALIDATION_ERROR");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return apiError("VALIDATION_ERROR");
  }

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

  // Structural validation above only checks the file *shape* (magic
  // bytes/size/format) — a well-formed PDF/image/document can still
  // carry an embedded malicious payload. Scanning is a separate,
  // defense-in-depth layer: see lib/security/scan.ts for why an
  // unreachable/unconfigured scanner fails open rather than blocking
  // every upload, and docs/SECURITY.md §9 for the full trade-off.
  // Rejects with the same generic UNSUPPORTED_FILE code a structural
  // validation failure would — never reveal to the client that a scan
  // ran or what it found.
  const scanResult = await scanFile(buffer);
  if (scanResult === "infected") {
    console.error(
      `[upload] rejected an infected upload (mimeType=${file.type}, size=${buffer.byteLength})`,
    );
    return apiError("UNSUPPORTED_FILE");
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
