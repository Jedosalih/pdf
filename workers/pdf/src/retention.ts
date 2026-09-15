const GUEST_FILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mirrors `lib/entitlements/retention.ts`'s `computeExpiry` on the app side
 * — duplicated rather than imported because `workers/pdf` is a fully
 * separate package (own `package.json`/`node_modules`) that never imports
 * Next.js/app code, same rationale as `workers/pdf/src/db.ts` duplicating
 * the app's Prisma-client-construction pattern instead of importing it.
 * A worker handler's output File always belongs to the same owner as the
 * Job that produced it, so `userId` alone (no guestId) is enough here.
 */
export function computeFileExpiry(userId: string | null): Date | null {
  return userId ? null : new Date(Date.now() + GUEST_FILE_TTL_MS);
}
