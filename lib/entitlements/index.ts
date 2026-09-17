import { prisma } from "@/lib/db/client";
import { getToolById } from "@/lib/tools/registry";
import type { ToolLimits } from "@/lib/tools/types";

export type Actor =
  | { type: "guest"; guestId: string }
  | { type: "user"; userId: string };

export interface EntitlementResult {
  allowed: boolean;
  reason?: "TOOL_DISABLED" | "GUEST_NOT_ALLOWED" | "DAILY_LIMIT_REACHED";
}

async function resolveLimits(toolId: string, actor: Actor): Promise<ToolLimits> {
  const tool = getToolById(toolId);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  if (actor.type === "guest") {
    const dbLimit = await prisma.toolLimit.findFirst({
      where: { toolId, planId: null },
    });
    return dbLimit ?? tool.limits.guest;
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: { userId: actor.userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (activeSubscription) {
    const dbLimit = await prisma.toolLimit.findFirst({
      where: { toolId, planId: activeSubscription.planId },
    });
    if (dbLimit) return dbLimit;
  }

  const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
  const freeLimit = freePlan
    ? await prisma.toolLimit.findFirst({
        where: { toolId, planId: freePlan.id },
      })
    : null;

  return freeLimit ?? tool.limits.free;
}

function actorWhere(actor: Actor) {
  return actor.type === "guest"
    ? { guestId: actor.guestId }
    : { userId: actor.userId };
}

/** Registered/free limits are known by the tool registry as a build-time
 * fallback; the DB (`ToolLimit`) is authoritative once seeded, so an admin
 * can change limits without a deploy (blueprint §11). */
export async function getToolLimits(
  actor: Actor,
  toolId: string,
): Promise<ToolLimits> {
  return resolveLimits(toolId, actor);
}

export async function getRemainingUsage(
  actor: Actor,
  toolId: string,
): Promise<{ used: number; limit: number }> {
  const limits = await resolveLimits(toolId, actor);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.usageRecord.count({
    where: { toolId, createdAt: { gte: since }, ...actorWhere(actor) },
  });
  return { used, limit: limits.dailyOperations };
}

/** Cheap, no-usage-read checks only (tool enabled, guest allowed) — safe
 * to call before doing any other work for a request, unlike the atomic
 * usage check below which should only run once a job is actually about
 * to be created (see `tryReserveToolUsage`). */
export async function canUseTool(
  actor: Actor,
  toolId: string,
): Promise<EntitlementResult> {
  const tool = getToolById(toolId);
  if (!tool || !tool.enabled) {
    return { allowed: false, reason: "TOOL_DISABLED" };
  }
  if (actor.type === "guest" && !tool.guestEnabled) {
    return { allowed: false, reason: "GUEST_NOT_ALLOWED" };
  }

  return { allowed: true };
}

/**
 * Atomically checks the actor's rolling-24h usage against their limit and
 * records this operation, in one Postgres transaction — returns `false`
 * without recording anything if the limit is already reached.
 *
 * This exists because the previous check-then-write (`canUseTool`'s old
 * daily-limit check, followed by a separate `recordToolUsage` insert
 * after the job was created) was a genuine TOCTOU race: concurrent
 * requests from the same actor could all read the same pre-increment
 * count and all pass the check before any of their inserts landed. The
 * batch-processing feature made this trivially reachable (its job-
 * creation requests are now sent one at a time specifically to avoid
 * being *a* trigger for it — see `docs/DECISIONS.md` — but that only
 * closed batch's own path, not the general race).
 *
 * A transaction-scoped Postgres advisory lock (`pg_advisory_xact_lock`,
 * keyed by a hash of `actor:tool`) is what makes this atomic: it
 * serializes concurrent requests for the *same* actor+tool (e.g. two
 * browser tabs, or a badly-behaved script firing requests in parallel),
 * while different actors or different tools never contend with each
 * other at all. The lock is released automatically at commit or
 * rollback — never held past this function returning, never leaked on
 * an error. A DB-level fix (rather than Redis) was chosen because Redis
 * isn't otherwise part of this project's data-integrity story (it's used
 * for BullMQ queues and rate-limiting only) and Postgres already is —
 * see the "simplest reliable DB solution" guidance in
 * `TASKS/JPdf_Final_Completion_Mission.md` §4.6.
 */
export async function tryReserveToolUsage(
  actor: Actor,
  toolId: string,
): Promise<boolean> {
  const limits = await resolveLimits(toolId, actor);
  const actorKey = actor.type === "guest" ? `guest:${actor.guestId}` : `user:${actor.userId}`;
  const lockKey = `${actorKey}:${toolId}`;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await tx.usageRecord.count({
      where: { toolId, createdAt: { gte: since }, ...actorWhere(actor) },
    });
    if (used >= limits.dailyOperations) {
      return false;
    }

    await tx.usageRecord.create({ data: { toolId, ...actorWhere(actor) } });
    return true;
  });
}
