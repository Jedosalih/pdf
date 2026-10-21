import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, destroySessionByToken, readSessionToken } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/auth/request";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // A cross-site page must not be able to sign the user out.
  if (!isSameOrigin(request)) return apiError("FORBIDDEN");
  const token = await readSessionToken();
  if (token) {
    await destroySessionByToken(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
