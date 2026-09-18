import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/connection";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Verifies the app can actually reach its real dependencies, not just
 * that the Node process is alive — a deploy workflow's health check
 * should mean "serving real requests," not "the container started."
 * Never used as an authorization boundary and never returns anything
 * beyond up/down per dependency — no connection strings, no error
 * details, per this project's own "never leak internals" rule
 * (docs/SECURITY.md §8).
 */
export async function GET() {
  const [db, redis, storage] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    getRedisConnection().ping(),
    getStorage().headBucket(),
  ]);

  const checks = {
    database: db.status === "fulfilled",
    redis: redis.status === "fulfilled",
    storage: storage.status === "fulfilled",
  };
  const healthy = Object.values(checks).every(Boolean);

  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, {
    status: healthy ? 200 : 503,
  });
}
