import { prisma } from "./db.js";
import { deleteObject } from "./storage.js";

/** How long a trashed file (`deletedAt` set, via the workspace Trash
 * feature) is kept before its storage object and DB row are permanently
 * removed -- matches the common "Trash empties after 30 days" product
 * convention. Explicit user "permanently delete" already bypasses this
 * entirely (app/api/files/[id]/route.ts's DELETE handler). */
const TRASH_RETENTION_DAYS = 30;

/** A job stuck in PROCESSING this long almost certainly means its worker
 * crashed or was killed mid-job without updating the row (a clean
 * success/failure always updates status itself) -- not a legitimately
 * slow job. Generous on purpose: the single longest per-subprocess
 * timeout anywhere in this codebase is OCR's 300s; 30 minutes leaves
 * enormous headroom for queueing delay on top of that before this
 * sweep ever touches a job that could still be genuinely active. */
const STALE_PROCESSING_THRESHOLD_MS = 30 * 60 * 1000;

export interface SweepResult {
  expiredGuestFiles: number;
  purgedTrashedFiles: number;
  staleProcessingJobs: number;
}

/**
 * Guest-owned files past their `expiresAt` (lib/entitlements/retention.ts
 * sets this 24h out at creation) get their storage object deleted and
 * their row marked `EXPIRED` -- kept, not hard-deleted, mirroring how
 * Trash is a soft-delete elsewhere in this codebase; nothing currently
 * reads an `EXPIRED` file back (job creation's ownership query only
 * accepts UPLOADED/READY), so keeping the row costs nothing and preserves
 * a real audit trail.
 *
 * Never touches a file that is *currently* the input to a job still
 * queued or processing, even if that file's own `expiresAt` has already
 * passed -- an edge case (a guest returning right at the 24h boundary)
 * that "never delete active jobs" still has to cover.
 */
async function sweepExpiredGuestFiles(now: Date): Promise<number> {
  const candidates = await prisma.file.findMany({
    where: {
      expiresAt: { lte: now },
      status: { not: "EXPIRED" },
      deletedAt: null,
      OR: [{ inputJob: null }, { inputJob: { status: { notIn: ["QUEUED", "PROCESSING"] } } }],
    },
    select: { id: true, storageKey: true },
  });

  let count = 0;
  for (const file of candidates) {
    try {
      await deleteObject(file.storageKey);
    } catch (error) {
      console.error(`[cleanup] failed to delete storage object for expired file: ${error}`);
      continue; // leave the row as-is; retried on the next sweep
    }
    await prisma.file.update({ where: { id: file.id }, data: { status: "EXPIRED" } });
    count += 1;
  }
  return count;
}

/**
 * Files sitting in Trash (`deletedAt` set) past the retention window are
 * permanently removed -- storage object *and* row, since past this point
 * there is no product surface that ever shows a trashed file again.
 */
async function sweepOldTrashedFiles(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await prisma.file.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, storageKey: true },
  });

  let count = 0;
  for (const file of candidates) {
    try {
      await deleteObject(file.storageKey);
    } catch (error) {
      console.error(`[cleanup] failed to delete storage object for trashed file: ${error}`);
      continue;
    }
    await prisma.file.delete({ where: { id: file.id } });
    count += 1;
  }
  return count;
}

/**
 * A job stuck in PROCESSING well past any realistic completion time is
 * marked FAILED so it stops looking "in progress" forever in a user's
 * history -- this never touches a QUEUED job (still legitimately waiting
 * for a worker slot) or a PROCESSING job younger than the threshold.
 */
async function sweepStaleProcessingJobs(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_THRESHOLD_MS);
  const result = await prisma.job.updateMany({
    where: { status: "PROCESSING", startedAt: { lte: cutoff } },
    data: { status: "FAILED", completedAt: now, errorCode: "WORKER_CRASHED" },
  });
  return result.count;
}

/**
 * Orphaned per-job temp directories (the other "storage growth
 * prevention" concern the wider cleanup story usually covers) are
 * deliberately *not* swept here: every worker's `withTempDir()` deletes
 * its own directory in a `finally` block on every normal code path, and
 * the temp root itself (`os.tmpdir()`, i.e. `/tmp`) is the container's
 * own ephemeral filesystem with no persistent volume backing it in
 * docker-compose.yml -- a hard-killed container's leftover temp files
 * vanish the moment that container is recreated (`restart: unless-
 * stopped` already guarantees this happens). There is no persistent,
 * shared temp location in this architecture for a periodic sweep to
 * meaningfully act on.
 */
export async function runCleanupSweep(): Promise<SweepResult> {
  const now = new Date();
  const [expiredGuestFiles, purgedTrashedFiles, staleProcessingJobs] = [
    await sweepExpiredGuestFiles(now),
    await sweepOldTrashedFiles(now),
    await sweepStaleProcessingJobs(now),
  ];

  // Counts only -- no file names, storage keys, or job ids, per this
  // codebase's logging rule (docs/SECURITY.md §8): never log anything
  // that could identify a specific user's content.
  console.log(
    `[cleanup] sweep complete: expiredGuestFiles=${expiredGuestFiles} ` +
      `purgedTrashedFiles=${purgedTrashedFiles} staleProcessingJobs=${staleProcessingJobs}`,
  );

  return { expiredGuestFiles, purgedTrashedFiles, staleProcessingJobs };
}
