import { cookies } from "next/headers";
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_MAX_AGE_SECONDS,
  packGuestId,
  unpackGuestId,
  generateGuestId,
} from "./guestIdCore";

/**
 * Identifies anonymous users via a signed, httpOnly cookie — not browser
 * fingerprinting (blueprint §10, §44). Call only from Route Handlers or
 * Server Actions, where `cookies()` is writable. In practice `proxy.ts`
 * already ensures this cookie exists by the time a page's client JS runs,
 * so this mainly just re-reads it — see `lib/security/guestIdCore.ts`.
 */
export async function getOrCreateGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE_NAME)?.value;
  const verified = existing ? unpackGuestId(existing) : null;
  if (verified) {
    return verified;
  }

  const id = generateGuestId();
  store.set(GUEST_COOKIE_NAME, packGuestId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return id;
}

/** Read-only variant for contexts that can't set cookies (e.g. Server Components). */
export async function readGuestId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE_NAME)?.value;
  return existing ? unpackGuestId(existing) : null;
}
