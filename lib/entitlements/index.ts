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

  const { used, limit } = await getRemainingUsage(actor, toolId);
  if (used >= limit) {
    return { allowed: false, reason: "DAILY_LIMIT_REACHED" };
  }

  return { allowed: true };
}

export async function recordToolUsage(
  actor: Actor,
  toolId: string,
): Promise<void> {
  await prisma.usageRecord.create({
    data: { toolId, windowStart: new Date(), ...actorWhere(actor) },
  });
}
