import crypto from "node:crypto";

export const GUEST_COOKIE_NAME = "jdpdf_guest";
export const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Pure signing helpers with no Next.js dependency, shared by:
 * - `lib/security/guestId.ts` (Route Handlers, via `next/headers` cookies)
 * - `proxy.ts` (runs on every navigation, via `NextRequest`/`NextResponse`)
 *
 * Having proxy.ts ensure the cookie exists on page loads — before any
 * client-side JS fires parallel API requests — avoids a race where two
 * concurrent uploads with no existing cookie each mint their own guest id
 * (see docs/DECISIONS.md).
 */
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

export function packGuestId(id: string): string {
  return `${id}.${sign(id)}`;
}

export function unpackGuestId(cookieValue: string): string | null {
  const [id, signature] = cookieValue.split(".");
  if (!id || !signature) return null;

  const expected = sign(id);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(provided, expectedBuffer)) return null;

  return id;
}

export function generateGuestId(): string {
  return crypto.randomUUID();
}
