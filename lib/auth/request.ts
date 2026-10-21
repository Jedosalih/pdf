import type { NextRequest } from "next/server";
import type { z } from "zod";
import { apiError } from "@/lib/api/errors";
import { readBodyWithLimit } from "@/lib/security/requestBody";

const MAX_AUTH_BODY_BYTES = 8 * 1024;

/**
 * Cross-site request check for state-changing auth endpoints. Session
 * cookies are SameSite=Lax, which already stops cross-site requests from
 * *carrying* a session, but not login CSRF (a hostile page submitting a
 * form that logs the victim into the attacker's account). Browsers always
 * send `Origin` on cross-origin POSTs; it must match the configured public
 * site or the request's own host. Non-browser clients that send no
 * `Origin` are allowed (they can't ride a victim's cookies anyway).
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).host);
    } catch {
      // ignore a malformed setting; the Host header check below still applies
    }
  }
  const host = request.headers.get("host");
  if (host) allowed.add(host);
  return allowed.has(originHost);
}

/**
 * Shared front door for every auth route: same-origin check, JSON content
 * type (an HTML form can't send it cross-site without a CORS preflight),
 * a small hard body cap, and a strict schema (unknown keys are rejected,
 * not ignored).
 */
export async function parseAuthRequest<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  if (!isSameOrigin(request)) return { ok: false, response: apiError("FORBIDDEN") };
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: apiError("VALIDATION_ERROR") };
  }
  const body = await readBodyWithLimit(request, MAX_AUTH_BODY_BYTES);
  if (!body) return { ok: false, response: apiError("VALIDATION_ERROR") };
  let json: unknown;
  try {
    json = JSON.parse(body.toString("utf-8"));
  } catch {
    return { ok: false, response: apiError("VALIDATION_ERROR") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, response: apiError("VALIDATION_ERROR") };
  return { ok: true, data: parsed.data };
}
