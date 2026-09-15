import type { NextRequest } from "next/server";

/**
 * Next.js 16's `NextRequest` no longer exposes `.ip` — read the reverse-proxy
 * header set by the deployment platform (Vercel/most others) instead, same
 * convention `proxy.ts` would need if it ever cared about IPs.
 */
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
