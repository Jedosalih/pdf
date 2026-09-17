import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import { canUseTool, getToolLimits, recordToolUsage } from "@/lib/entitlements";
import { computeExpiry } from "@/lib/entitlements/retention";
import { resolveActor } from "@/lib/security/actor";
import { enqueueProcessingJob } from "@/lib/queue/queues";
import { apiError } from "@/lib/api/errors";
import { listRecentJobs } from "@/lib/workspace/jobs";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const createJobSchema = z.object({
  toolId: z.string().min(1),
  fileIds: z.array(z.string().min(1)).min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

/**
 * `edit-pdf`/`fill-sign-pdf` carry base64 image data inside the generic
 * `options` JSON rather than a multipart upload (see docs/SECURITY.md §1).
 * Each individual image is capped (8MB, `pdfEditElements.ts`'s
 * `MAX_IMAGE_BYTES`) and the edit *count* is capped (300,
 * `MAX_EDITS`), but nothing previously capped the request body as a
 * whole -- 300 elements at 8MB each is a multi-gigabyte JSON payload that
 * `request.json()` would fully buffer into memory before any per-element
 * check runs. A generous but finite cap here (comfortably above any real
 * editing session) bounds worst-case memory use for this route. This
 * checks the browser-supplied `Content-Length` header, so it fully
 * defends the actual product UI (which always sends an accurate header
 * for a JSON string body) but would not stop a deliberately malicious API
 * caller who lies about `Content-Length` while streaming more bytes than
 * declared -- closing that fully would need a streaming byte-counter
 * instead of `request.json()`, not done here (see docs/SECURITY.md).
 */
const MAX_JOB_BODY_BYTES = 50 * 1024 * 1024;

const listJobsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * `ToolLimits.maxPages` ("max total pages across all input files") had a
 * real, per-tool/per-plan value in the registry and DB but was never
 * actually compared against anything anywhere in the codebase -- found
 * while adding compare-pdf's own page limits and confirmed with a
 * repo-wide search. This is the fix: a real, generic gate at job
 * creation, the one place every tool's input files are already gathered
 * regardless of which tool it is. Only PDF inputs are counted (the
 * overwhelming majority of tools and the ones with an unbounded-pages
 * risk) -- non-PDF inputs are already bounded by file size and are
 * skipped rather than guessed at. See docs/DECISIONS.md.
 */
async function countTotalPdfPages(files: { storageKey: string; mimeType: string }[]): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const storage = getStorage();
  let total = 0;
  for (const file of files) {
    if (file.mimeType !== "application/pdf") continue;
    const buffer = await storage.getObject(file.storageKey);
    const doc = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
    total += doc.numPages;
  }
  return total;
}

/** History listing — requires a real signed-in user (guests have no
 * persistent workspace). */
export async function GET(request: NextRequest) {
  const actor = await resolveActor();
  if (actor.type !== "user") {
    return apiError("AUTH_REQUIRED");
  }

  const parsed = listJobsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }

  const result = await listRecentJobs({ userId: actor.userId, ...parsed.data });
  return NextResponse.json(result);
}

/**
 * Validates entitlements and file ownership, then enqueues the job and
 * returns immediately — the browser never waits on a long request for
 * processing (blueprint §4).
 */
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_JOB_BODY_BYTES) {
    return apiError("FILE_TOO_LARGE");
  }

  const parsed = createJobSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }
  const { toolId, fileIds, options } = parsed.data;

  const tool = getToolById(toolId);
  if (!tool || !tool.enabled) {
    return apiError("TOOL_DISABLED");
  }

  const actor = await resolveActor();

  const entitlement = await canUseTool(actor, toolId);
  if (!entitlement.allowed) {
    return apiError(entitlement.reason ?? "FORBIDDEN");
  }

  const limits = await getToolLimits(actor, toolId);
  if (fileIds.length > limits.maxFiles) {
    return apiError("TOO_MANY_FILES");
  }

  const ownedFiles = await prisma.file.findMany({
    where: {
      id: { in: fileIds },
      // A fresh upload ("UPLOADED") or a previously-completed job's own
      // output ("READY") are both complete, available file bytes and
      // valid job input -- workspace chaining (blueprint: "use an
      // existing workspace file as input without re-upload") reuses a
      // prior job's result exactly this way. PROCESSING/FAILED/EXPIRED/
      // UPLOADING files are never valid inputs.
      status: { in: ["UPLOADED", "READY"] },
      deletedAt: null,
      ...(actor.type === "guest"
        ? { guestId: actor.guestId }
        : { userId: actor.userId }),
    },
  });
  if (ownedFiles.length !== fileIds.length) {
    return apiError("FORBIDDEN");
  }

  // `/api/upload` validates type/size against the tool the file was
  // *originally* uploaded for, but workspace chaining (blueprint: "use an
  // existing workspace file as input without re-upload") can hand any of
  // the actor's own files to a *different* tool here -- e.g. a file
  // accepted under one tool's 50MB limit chained into a tool with a 15MB
  // limit, or a non-PDF job output chained into a PDF-only tool. Re-check
  // against every destination tool's own limits rather than trusting the
  // file's original validation. This trusts the file's stored `mimeType`/
  // `size` (set once at upload or by the worker on job completion, never
  // user-editable after that) instead of re-reading and re-sniffing the
  // bytes -- proportionate, since the bytes themselves cannot change
  // in-place, only which tool they're later handed to.
  const invalidFile = ownedFiles.find((file) => !tool.inputTypes.includes(file.mimeType));
  if (invalidFile) {
    return apiError("UNSUPPORTED_FILE");
  }
  const oversizedFile = ownedFiles.find((file) => file.size > limits.maxFileSizeBytes);
  if (oversizedFile) {
    return apiError("FILE_TOO_LARGE");
  }

  let totalPdfPages: number;
  try {
    totalPdfPages = await countTotalPdfPages(ownedFiles);
  } catch {
    // An unparseable "PDF" here means the real engine will reject it with
    // its own clearer error shortly -- don't block job creation on this
    // best-effort structural check failing to even open the file.
    totalPdfPages = 0;
  }
  if (totalPdfPages > limits.maxPages) {
    return apiError("TOO_MANY_PAGES");
  }

  const job = await prisma.job.create({
    data: {
      userId: actor.type === "user" ? actor.userId : null,
      guestId: actor.type === "guest" ? actor.guestId : null,
      toolId,
      status: "QUEUED",
      // `fileOrder` is the source of truth for input ordering (relevant for
      // merge order) — relational `connect` order is not guaranteed on read.
      options: { ...options, fileOrder: fileIds },
      expiresAt: computeExpiry(actor),
      inputFiles: {
        connect: fileIds.map((id) => ({ id })),
      },
    },
  });

  await recordToolUsage(actor, toolId);
  await enqueueProcessingJob(tool.queue, job.id);

  return NextResponse.json({ jobId: job.id, status: job.status });
}
