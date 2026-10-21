import { getRedisConnection } from "@/lib/queue/connection";

/**
 * Simple fixed-window counter on top of the already-provisioned queue Redis
 * connection — no new infrastructure. `INCR` and `EXPIRE ... NX` run in one
 * MULTI so a key can never be left without an expiry (a crash between two
 * separate calls previously could leave a counter that never reset,
 * locking that key out permanently). `NX` only sets the expiry on the
 * window's first hit, so later hits don't extend the window.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean }> {
  const redisKey = `ratelimit:${key}`;
  const results = await getRedisConnection()
    .multi()
    .incr(redisKey)
    .expire(redisKey, opts.windowSeconds, "NX")
    .exec();
  const count = Number(results?.[0]?.[1] ?? Number.POSITIVE_INFINITY);
  return { allowed: count <= opts.limit };
}

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

/** Every rule is counted (so one rejected request still costs against
 * each bucket), and the request is allowed only if all of them allow it. */
export async function checkRateLimits(rules: RateLimitRule[]): Promise<boolean> {
  const results = await Promise.all(
    rules.map((rule) => checkRateLimit(rule.key, { limit: rule.limit, windowSeconds: rule.windowSeconds })),
  );
  return results.every((result) => result.allowed);
}
