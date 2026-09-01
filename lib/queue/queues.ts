import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import type { ToolQueue } from "@/lib/tools/types";

const queues = new Map<ToolQueue, Queue>();

export function getQueue(name: ToolQueue): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getRedisConnection() });
    queues.set(name, queue);
  }
  return queue;
}

export interface ProcessingJobPayload {
  jobId: string;
}

/**
 * The queue payload is just the DB job id — the worker loads everything
 * else (tool, options, input file keys) from Postgres. Using our own Job.id
 * as the BullMQ job id gives free idempotency: re-enqueuing the same job id
 * is a no-op if it's already queued/active (blueprint §47).
 */
export async function enqueueProcessingJob(
  queueName: ToolQueue,
  jobId: string,
): Promise<void> {
  const queue = getQueue(queueName);
  await queue.add(
    "process",
    { jobId } satisfies ProcessingJobPayload,
    {
      jobId,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 1,
    },
  );
}
