import type { Actor } from "@/lib/entitlements";
import { getOrCreateGuestId } from "./guestId";

/**
 * Single place that decides who is making a request. Phase 4 (auth) only
 * needs to change this function — return `{ type: "user", userId }` when a
 * session exists — everything else already speaks in terms of `Actor`.
 */
export async function resolveActor(): Promise<Actor> {
  const guestId = await getOrCreateGuestId();
  return { type: "guest", guestId };
}
