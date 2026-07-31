import { Queue } from "bullmq";
import type Redis from "ioredis";
import type { QueueName } from "./queueNames.js";

const queues = new Map<QueueName, Queue>();

/** Returns a singleton BullMQ Queue for the given name. */
export function getQueue(name: QueueName, connection: Redis): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection });
  queues.set(name, queue);
  return queue;
}

export async function closeAllQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}
