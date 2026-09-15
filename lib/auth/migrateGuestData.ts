import { prisma } from "@/lib/db/client";

/**
 * Reassigns a guest's existing Job/File rows to a newly authenticated user,
 * called from both register and login right after the actor's guestId is
 * resolved and the user's identity is confirmed. Safe to call unconditionally
 * on every login: once a guestId has been migrated its rows have
 * `guestId: null`, so re-running this against the same (now-stale) guestId
 * cookie is a no-op `updateMany` matching zero rows.
 *
 * `UsageRecord` is deliberately NOT migrated — a fresh free-tier daily quota
 * is part of the signup incentive (free-tier limits are set higher than the
 * guest tier), and carrying over guest usage counts would undermine that.
 */
export async function migrateGuestData(guestId: string, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.file.updateMany({
      where: { guestId },
      data: { userId, guestId: null, expiresAt: null },
    }),
    prisma.job.updateMany({
      where: { guestId },
      data: { userId, guestId: null, expiresAt: null },
    }),
  ]);
}
