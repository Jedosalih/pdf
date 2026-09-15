import { getRedisConnection } from "@/lib/queue/connection";

/**
 * Simple fixed-window counter on top of the already-provisioned queue Redis
 * connection — no new infrastructure. `INCR` on a fresh key returns 1, at
 * which point we attach the window's expiry; every subsequent call in the
 * same window just increments the same key until Redis expires it.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean }> {
  const redis = getRedisConnection();
  const count = await redis.incr(`ratelimit:${key}`);
  if (count === 1) {
    await redis.expire(`ratelimit:${key}`, opts.windowSeconds);
  }
  return { allowed: count <= opts.limit };
}
