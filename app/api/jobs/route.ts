import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import { canUseTool, getToolLimits, recordToolUsage } from "@/lib/entitlements";
import { resolveActor } from "@/lib/security/actor";
import { enqueueProcessingJob } from "@/lib/queue/queues";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const createJobSchema = z.object({
  toolId: z.string().min(1),
  fileIds: z.array(z.string().min(1)).min(1),
  options: z.record(z.string(), z.unknown()).optional(),
});

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
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      inputFiles: {
        connect: fileIds.map((id) => ({ id })),
      },
    },
  });

  await recordToolUsage(actor, toolId);
  await enqueueProcessingJob(tool.queue, job.id);

  return NextResponse.json({ jobId: job.id, status: job.status });
}
