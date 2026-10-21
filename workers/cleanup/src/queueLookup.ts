import { Queue } from "bullmq";
import type { Redis } from "ioredis";

/** Every queue a processing worker consumes (lib/tools/types.ts ToolQueue
 * minus "image-processing", which no worker or tool uses). */
export const PROCESSING_QUEUE_NAMES = ["pdf-processing", "office-conversion", "ocr", "html-rendering"];

const PENDING_STATES = new Set(["waiting", "active", "delayed", "prioritized", "waiting-children"]);

export interface QueueLookup {
  /** True while BullMQ still holds this job id as pending or running in
   * any of the queues -- i.e. a worker will still pick it up. */
  isPending(jobId: string): Promise<boolean>;
  close(): Promise<void>;
}

/** Job ids are our own `Job.id` (lib/queue/queues.ts enqueues with
 * `jobId`), so the DB row maps directly to its BullMQ job. */
export function createQueueLookup(connection: Redis, queueNames = PROCESSING_QUEUE_NAMES): QueueLookup {
  const queues = queueNames.map((name) => new Queue(name, { connection }));
  return {
    async isPending(jobId) {
      for (const queue of queues) {
        if (PENDING_STATES.has(await queue.getJobState(jobId))) return true;
      }
      return false;
    },
    async close() {
      await Promise.all(queues.map((queue) => queue.close()));
    },
  };
}
