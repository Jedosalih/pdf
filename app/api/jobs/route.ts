import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import {
  canUseTool,
  getToolLimits,
  releaseToolUsage,
  tryReserveToolUsage,
} from "@/lib/entitlements";
import { computeExpiry } from "@/lib/entitlements/retention";
import { resolveActor } from "@/lib/security/actor";
import { allowGuestJobForIp, allowJobRequest } from "@/lib/security/abuseLimits";
import { countPdfPages } from "@/lib/security/pageCount";
import { readBodyWithLimit } from "@/lib/security/requestBody";
import { enqueueProcessingJob } from "@/lib/queue/queues";
import { apiError, type ApiErrorCode } from "@/lib/api/errors";
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
 * `MAX_EDITS`); this caps the request body as a whole, generously above
 * any real editing session. Enforced on the bytes actually received
 * (`readBodyWithLimit`), not just the declared `Content-Length`.
 */
const MAX_JOB_BODY_BYTES = 50 * 1024 * 1024;

const listJobsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type PageLimitCheck = "ok" | "deferred" | ApiErrorCode;

/**
 * The generic `ToolLimits.maxPages` ("max total pages across all input
 * files") gate at job creation, the one place every tool's input files
 * are already gathered. Only PDF inputs are counted -- non-PDF inputs are
 * already bounded by file size. Fails closed (see lib/security/pageCount.ts):
 * a PDF whose pages can't be counted is refused, except for tools flagged
 * `deferPageLimitToWorker`, whose worker enforces the same limit once it
 * can read the file (the limit travels in the job's server-set options).
 * See docs/DECISIONS.md.
 */
async function checkPageLimit(
  files: { storageKey: string; mimeType: string }[],
  maxPages: number,
  deferToWorker: boolean,
): Promise<PageLimitCheck> {
  const storage = getStorage();
  let total = 0;
  for (const file of files) {
    if (file.mimeType !== "application/pdf") continue;
    const result = await countPdfPages(await storage.getObject(file.storageKey));
    if (!result.ok) {
      if (deferToWorker) return "deferred";
      return result.reason === "ENCRYPTED" ? "ENCRYPTED_PDF" : "UNSUPPORTED_FILE";
    }
    total += result.pages;
  }
  return total > maxPages ? "TOO_MANY_PAGES" : "ok";
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
  const actor = await resolveActor();
  if (!(await allowJobRequest(request, actor))) {
    return apiError("RATE_LIMITED");
  }

  const body = await readBodyWithLimit(request, MAX_JOB_BODY_BYTES);
  if (!body) {
    return apiError("FILE_TOO_LARGE");
  }

  let json: unknown = null;
  try {
    json = JSON.parse(body.toString("utf-8"));
  } catch {
    // fall through to the schema check below
  }
  const parsed = createJobSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR");
  }
  const { toolId, fileIds, options } = parsed.data;

  const tool = getToolById(toolId);
  if (!tool || !tool.enabled) {
    return apiError("TOOL_DISABLED");
  }

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

  const pageCheck = await checkPageLimit(ownedFiles, limits.maxPages, tool.deferPageLimitToWorker === true);
  if (pageCheck !== "ok" && pageCheck !== "deferred") {
    return apiError(pageCheck);
  }

  // Cookie-only guest identities are free to discard, so guests are also
  // capped per IP across every guest id (lib/security/abuseLimits.ts).
  if (actor.type === "guest" && !(await allowGuestJobForIp(request))) {
    return apiError("RATE_LIMITED");
  }

  // Atomic check-and-record — see tryReserveToolUsage's own docs for why
  // this can't be a separate check-then-insert like every check above it.
  const usageRecordId = await tryReserveToolUsage(actor, toolId);
  if (!usageRecordId) {
    return apiError("DAILY_LIMIT_REACHED");
  }

  const job = await prisma.job.create({
    data: {
      userId: actor.type === "user" ? actor.userId : null,
      guestId: actor.type === "guest" ? actor.guestId : null,
      toolId,
      status: "QUEUED",
      // `fileOrder` is the source of truth for input ordering (relevant for
      // merge order) — relational `connect` order is not guaranteed on read.
      // `maxPages` is server-set after the client's options, so a client
      // can't override it; deferPageLimitToWorker tools' workers enforce it.
      options: {
        ...options,
        fileOrder: fileIds,
        ...(tool.deferPageLimitToWorker ? { maxPages: limits.maxPages } : {}),
      },
      expiresAt: computeExpiry(actor),
      inputFiles: {
        connect: fileIds.map((id) => ({ id })),
      },
    },
  });

  try {
    await enqueueProcessingJob(tool.queue, job.id);
  } catch (error) {
    // The job never reached a worker: fail it now (rather than leaving a
    // QUEUED row nothing will ever pick up) and give the usage back.
    console.error(`[jobs] enqueue failed job=${job.id} tool=${toolId}`, error);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date(), errorCode: "QUEUE_UNAVAILABLE" },
    });
    await releaseToolUsage(usageRecordId);
    return apiError("INTERNAL_ERROR");
  }

  return NextResponse.json({ jobId: job.id, status: job.status });
}
