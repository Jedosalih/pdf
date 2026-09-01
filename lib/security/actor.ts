import type { Actor } from "@/lib/entitlements";
import { getOrCreateGuestId, readGuestId } from "./guestId";

/**
 * Single place that decides who is making a request. Phase 4 (auth) only
 * needs to change this function — return `{ type: "user", userId }` when a
 * session exists — everything else already speaks in terms of `Actor`.
 *
 * Only call this from Route Handlers/Server Actions — it mints a guest
 * cookie on first use, and Next.js only allows writing cookies there.
 */
export async function resolveActor(): Promise<Actor> {
  const guestId = await getOrCreateGuestId();
  return { type: "guest", guestId };
}

/**
 * Safe to call from Server Components (e.g. a tool page rendering its
 * current limits). Never mints a cookie — if none exists yet, returns a
 * throwaway id. Only use this for read-only lookups where the actor's
 * `guestId` value itself doesn't matter (e.g. `getToolLimits`, which
 * branches on `actor.type` and never reads `guestId` for the guest case).
 * Do NOT use this for anything that persists or checks ownership by
 * `guestId` — use `resolveActor` for that.
 */
export async function resolveActorReadOnly(): Promise<Actor> {
  const guestId = await readGuestId();
  return { type: "guest", guestId: guestId ?? "anonymous" };
}
