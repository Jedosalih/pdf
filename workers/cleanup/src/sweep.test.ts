/**
 * Regression coverage for runCleanupSweep(), run as a plain script rather
 * than through this project's Playwright E2E suite: every other test in
 * this codebase drives real behavior through the app's own UI/API, but
 * this feature's scenarios (a file that expired 25 hours ago, a job
 * stuck in PROCESSING for 2 hours) require backdating timestamps the
 * product itself never exposes a way to set — there is no user action
 * that produces "a file whose expiresAt is in the past" on demand. This
 * seeds those exact scenarios directly via Prisma, runs the real sweep
 * function unmodified, and asserts on both the returned counts and the
 * resulting DB state. Run with `npm run test` in this package (needs a
 * real Postgres/Redis/MinIO reachable via the usual env vars — the same
 * ones docker-compose.yml already provides).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { runCleanupSweep } from "./sweep.js";

const TOOL_ID = "compress-pdf";
const HOUR_MS = 60 * 60 * 1000;

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function makeFile(overrides: {
  expiresAt?: Date | null;
  deletedAt?: Date | null;
  status?: "UPLOADED" | "READY" | "EXPIRED";
  inputJobId?: string | null;
}) {
  return prisma.file.create({
    data: {
      guestId: `sweep-test-${randomUUID()}`,
      storageKey: `sweep-test/${randomUUID()}.pdf`,
      originalName: "test.pdf",
      mimeType: "application/pdf",
      size: 100,
      status: overrides.status ?? "UPLOADED",
      expiresAt: overrides.expiresAt,
      deletedAt: overrides.deletedAt,
      inputJobId: overrides.inputJobId ?? null,
    },
  });
}

async function makeJob(overrides: { status: "QUEUED" | "PROCESSING"; startedAt?: Date }) {
  return prisma.job.create({
    data: {
      guestId: `sweep-test-${randomUUID()}`,
      toolId: TOOL_ID,
      status: overrides.status,
      startedAt: overrides.startedAt,
    },
  });
}

async function main() {
  const now = Date.now();

  // Scenario 1: a plain expired guest file -- should be swept.
  const expiredFile = await makeFile({ expiresAt: new Date(now - HOUR_MS) });

  // Scenario 2: an expired file that is *currently* the input to an
  // actively-processing job -- must be left alone entirely.
  const activeJob = await makeJob({ status: "PROCESSING", startedAt: new Date(now) });
  const protectedFile = await makeFile({
    expiresAt: new Date(now - HOUR_MS),
    inputJobId: activeJob.id,
  });

  // Scenario 3: a file trashed 31 days ago -- past the retention window,
  // should be hard-deleted.
  const oldTrashedFile = await makeFile({ deletedAt: new Date(now - 31 * 24 * HOUR_MS) });

  // Scenario 4: a file trashed only 2 days ago -- still well within the
  // retention window, must survive.
  const recentTrashedFile = await makeFile({ deletedAt: new Date(now - 2 * 24 * HOUR_MS) });

  // Scenario 5: a job stuck in PROCESSING for 2 hours -- past the stale
  // threshold, should be reaped as failed.
  const staleJob = await makeJob({ status: "PROCESSING", startedAt: new Date(now - 2 * HOUR_MS) });

  // Scenario 6: a job legitimately PROCESSING for 2 minutes -- must
  // survive untouched.
  const freshJob = await makeJob({ status: "PROCESSING", startedAt: new Date(now - 2 * 60_000) });

  const result = await runCleanupSweep();

  assert(result.expiredGuestFiles >= 1, "sweep reports at least one expired file processed");
  assert(result.purgedTrashedFiles >= 1, "sweep reports at least one old trashed file purged");
  assert(result.staleProcessingJobs >= 1, "sweep reports at least one stale job reaped");

  const [expired, protectedRow, oldTrashed, recentTrashed, stale, fresh] = await Promise.all([
    prisma.file.findUniqueOrThrow({ where: { id: expiredFile.id } }),
    prisma.file.findUniqueOrThrow({ where: { id: protectedFile.id } }),
    prisma.file.findUnique({ where: { id: oldTrashedFile.id } }),
    prisma.file.findUniqueOrThrow({ where: { id: recentTrashedFile.id } }),
    prisma.job.findUniqueOrThrow({ where: { id: staleJob.id } }),
    prisma.job.findUniqueOrThrow({ where: { id: freshJob.id } }),
  ]);

  assert(expired.status === "EXPIRED", "plain expired file was marked EXPIRED");
  assert(protectedRow.status === "UPLOADED", "expired file used by an active job was left alone");
  assert(oldTrashed === null, "old trashed file was hard-deleted");
  assert(recentTrashed.deletedAt !== null, "recently trashed file survived");
  assert(stale.status === "FAILED" && stale.errorCode === "WORKER_CRASHED", "stale job reaped");
  assert(fresh.status === "PROCESSING", "freshly-processing job was left alone");

  // Cleanup: remove everything this script created, whether or not the
  // sweep already did (recentTrashedFile/freshJob/protectedFile were
  // deliberately left behind by the sweep and need manual removal here).
  await prisma.file.deleteMany({
    where: { id: { in: [expiredFile.id, protectedFile.id, recentTrashedFile.id] } },
  });
  await prisma.job.deleteMany({ where: { id: { in: [activeJob.id, staleJob.id, freshJob.id] } } });

  await prisma.$disconnect();

  if (failures > 0) {
    console.error(`${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("all assertions passed");
}

void main();
