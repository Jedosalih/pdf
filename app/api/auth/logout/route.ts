import { NextResponse } from "next/server";
import { clearSessionCookie, destroySessionByToken, readSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const token = await readSessionToken();
  if (token) {
    await destroySessionByToken(token);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
