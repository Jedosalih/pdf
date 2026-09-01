import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "jdpdf_guest";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function requireSecret(): string {
  const secret = process.env.GUEST_ID_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: GUEST_ID_SECRET");
  }
  return secret;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", requireSecret()).update(value).digest("hex");
}

function pack(id: string): string {
  return `${id}.${sign(id)}`;
}

function unpack(cookieValue: string): string | null {
  const [id, signature] = cookieValue.split(".");
  if (!id || !signature) return null;

  const expected = sign(id);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(provided, expectedBuffer)) return null;

  return id;
}

/**
 * Identifies anonymous users via a signed, httpOnly cookie — not browser
 * fingerprinting (blueprint §10, §44). Call only from Route Handlers or
 * Server Actions, where `cookies()` is writable.
 */
export async function getOrCreateGuestId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  const verified = existing ? unpack(existing) : null;
  if (verified) {
    return verified;
  }

  const id = crypto.randomUUID();
  store.set(COOKIE_NAME, pack(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return id;
}

/** Read-only variant for contexts that can't set cookies (e.g. Server Components). */
export async function readGuestId(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  return existing ? unpack(existing) : null;
}
