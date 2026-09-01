import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/lib/i18n/routing";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_MAX_AGE_SECONDS,
  packGuestId,
  unpackGuestId,
  generateGuestId,
} from "@/lib/security/guestIdCore";

const intlMiddleware = createMiddleware(routing);

/**
 * Ensures the signed guest-id cookie exists on every page navigation,
 * before any client-side JS runs. Without this, two parallel uploads from
 * a brand-new guest (no cookie yet) would each mint their own guest id in
 * the Route Handler, leaving the uploaded files owned by two different
 * guest ids and job creation failing ownership checks — see
 * docs/DECISIONS.md.
 */
export default async function proxy(request: NextRequest) {
  const response = await intlMiddleware(request);

  const existing = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const verified = existing ? unpackGuestId(existing) : null;

  if (!verified) {
    const id = generateGuestId();
    response.cookies.set(GUEST_COOKIE_NAME, packGuestId(id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
