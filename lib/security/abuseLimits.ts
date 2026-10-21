import type { NextRequest } from "next/server";
import type { Actor } from "@/lib/entitlements";
import { getClientIp } from "./clientIp";
import { checkRateLimits, type RateLimitRule } from "./rateLimit";

/**
 * Request-rate abuse controls for the two expensive endpoints. These are
 * a security throttle on top of -- never a replacement for -- the
 * per-tool `dailyOperations` entitlement (lib/entitlements), which stays
 * the product limit admins tune in the DB. Each value can be overridden
 * per environment without a code change.
 *
 * Why both per-IP and per-actor buckets: a guest actor is only a cookie,
 * which a script can discard on every request to get a fresh guest and a
 * fresh daily quota. The per-IP buckets (and the per-IP guest daily job
 * cap) are what bound that. Defaults are sized so a real user running a
 * full 20-file batch (uploads + jobs) never comes close.
 */
function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const WINDOW_SECONDS = 10 * 60;
const DAY_SECONDS = 24 * 60 * 60;

function actorKey(actor: Actor): string {
  return actor.type === "guest" ? `guest:${actor.guestId}` : `user:${actor.userId}`;
}

function rules(kind: "upload" | "job", request: NextRequest, actor: Actor): RateLimitRule[] {
  const prefix = kind.toUpperCase();
  const ip = getClientIp(request);
  return [
    { key: `${kind}:ip:${ip}`, limit: envInt(`${prefix}_RATE_LIMIT_PER_IP`, 200), windowSeconds: WINDOW_SECONDS },
    { key: `${kind}:actor:${actorKey(actor)}`, limit: envInt(`${prefix}_RATE_LIMIT_PER_ACTOR`, 100), windowSeconds: WINDOW_SECONDS },
  ];
}

export function allowUploadRequest(request: NextRequest, actor: Actor): Promise<boolean> {
  return checkRateLimits(rules("upload", request, actor));
}

export function allowJobRequest(request: NextRequest, actor: Actor): Promise<boolean> {
  return checkRateLimits(rules("job", request, actor));
}

/** Total guest jobs per IP per rolling day, across every guest id seen
 * from that IP -- the cap that makes cookie-discarding pointless beyond
 * this ceiling. Signed-in users are bounded by their own account's
 * `dailyOperations` instead. */
export function allowGuestJobForIp(request: NextRequest): Promise<boolean> {
  return checkRateLimits([
    {
      key: `guest-jobs:ip:${getClientIp(request)}`,
      limit: envInt("GUEST_DAILY_JOBS_PER_IP", 300),
      windowSeconds: DAY_SECONDS,
    },
  ]);
}
