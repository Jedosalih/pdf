const GUEST_FILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mirrors `lib/entitlements/retention.ts`'s `computeExpiry` on the app
 * side and the sibling workers' own copies — duplicated rather than
 * imported because `workers/ocr` is a fully separate package that never
 * imports Next.js/app code.
 */
export function computeFileExpiry(userId: string | null): Date | null {
  return userId ? null : new Date(Date.now() + GUEST_FILE_TTL_MS);
}
