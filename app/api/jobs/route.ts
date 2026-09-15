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

export const runtime = "nodejs";

const createJobSchema = z.object({
  toolId: z.string().min(1),
  fileIds: z.array(z.string().min(1)).min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

const listJobsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

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
      status: "UPLOADED",
      ...(actor.type === "guest"
        ? { guestId: actor.guestId }
        : { userId: actor.userId }),
    },
  });
  if (ownedFiles.length !== fileIds.length) {
    return apiError("FORBIDDEN");
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
