import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { runCleanupSweep } from "./sweep.js";

const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const SCHEDULER_ID = "cleanup-sweep";

const queue = new Queue("cleanup", { connection });

const worker = new Worker(
  "cleanup",
  async () => {
    await runCleanupSweep();
  },
  { connection, concurrency: 1 },
);

worker.on("error", (error) => {
  console.error("[cleanup-worker] worker error:", error);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
});

async function main() {
  // `upsertJobScheduler` is idempotent by design (keyed on SCHEDULER_ID) --
  // safe to call on every container start/restart without creating
  // duplicate recurring schedules. Verified against the real container
  // that, for an `every`-based (non-cron) schedule, this does *not* also
  // trigger an immediate run -- the `immediately` option only applies to
  // cron `pattern` schedules (BullMQ's own docs say so; confirmed
  // empirically here too, not just taken on faith) -- so the explicit
  // sweep below is genuinely needed, not redundant with it.
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: SWEEP_INTERVAL_MS }, { name: "sweep" });
  console.log(
    `[cleanup-worker] listening on queue: cleanup (sweep every ${SWEEP_INTERVAL_MS / 60_000}m)`,
  );

  // Run one sweep immediately at startup rather than waiting a full
  // interval for the first one -- a container that's been down for a
  // while (e.g. during a deploy) shouldn't leave expired files sitting
  // around for up to an hour before the first scheduled tick.
  await runCleanupSweep();
}

void main();
