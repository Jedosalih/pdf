import type { Actor } from "./index";

const GUEST_FILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Guest-owned Job/File rows expire after 24h (matching the guest cookie's
 * inherently temporary nature); authenticated-user-owned rows never expire
 * on their own — they persist until the user deletes them via the workspace
 * (see docs/DECISIONS.md, "Star/Trash schema for My Documents"). Audited
 * every existing `expiresAt` consumer before introducing `null` here — the
 * field is only ever written, never read/filtered/compared anywhere in the
 * app or worker today, so `null` is safe to introduce.
 */
export function computeExpiry(actor: Actor): Date | null {
  return actor.type === "user" ? null : new Date(Date.now() + GUEST_FILE_TTL_MS);
}
