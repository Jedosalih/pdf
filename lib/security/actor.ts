import type { Actor } from "@/lib/entitlements";
import { getSessionUser } from "@/lib/auth/session";
import { getOrCreateGuestId, readGuestId } from "./guestId";

/**
 * Single place that decides who is making a request. `getSessionUser()` is
 * a pure read (cookie + DB read, no writes) so it's safe to check first in
 * both variants below; when no valid session exists we fall through to the
 * pre-existing guest-cookie logic unchanged.
 *
 * Only call this from Route Handlers/Server Actions — it mints a guest
 * cookie on first use, and Next.js only allows writing cookies there.
 */
export async function resolveActor(): Promise<Actor> {
  const user = await getSessionUser();
  if (user) return { type: "user", userId: user.id };

  const guestId = await getOrCreateGuestId();
  return { type: "guest", guestId };
}

/**
 * Safe to call from Server Components (e.g. a tool page rendering its
 * current limits). Never mints a guest cookie — if none exists yet, returns
 * a throwaway id. Only use this for read-only lookups where the actor's
 * `guestId` value itself doesn't matter (e.g. `getToolLimits`, which
 * branches on `actor.type` and never reads `guestId` for the guest case).
 * Do NOT use this for anything that persists or checks ownership by
 * `guestId` — use `resolveActor` for that.
 */
export async function resolveActorReadOnly(): Promise<Actor> {
  const user = await getSessionUser();
  if (user) return { type: "user", userId: user.id };

  const guestId = await readGuestId();
  return { type: "guest", guestId: guestId ?? "anonymous" };
}

/**
 * Shared ownership check for any record with nullable `userId`/`guestId`
 * columns (`Job`, `File`) — the same expression previously duplicated
 * inline in every route that enforces ownership.
 */
export function isOwnedByActor(
  record: { userId: string | null; guestId: string | null },
  actor: Actor,
): boolean {
  return actor.type === "guest"
    ? record.guestId === actor.guestId
    : record.userId === actor.userId;
}
