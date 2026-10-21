import type { NextRequest } from "next/server";

/**
 * Number of reverse proxies in front of the app that each *append* the
 * connecting address to `X-Forwarded-For` (nginx `$proxy_add_x_forwarded_for`,
 * Caddy, Traefik, most load balancers). The client address is the entry
 * that many hops from the right -- everything left of it was supplied by
 * the client itself and must never be trusted (the leftmost entry, used
 * previously, let any caller pick its own IP and sidestep every per-IP
 * rate limit by changing a header).
 *
 * Next.js only fills `X-Forwarded-For` from the socket when the header is
 * absent, so with NO proxy in front, a client-supplied header passes
 * through unchanged: production must run behind a proxy that appends it
 * (docs/DEPLOYMENT.md).
 */
function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export function getClientIp(request: NextRequest): string {
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const index = entries.length - trustedProxyHops();
  return entries[Math.max(0, index)] ?? "unknown";
}
