import { getPrismaClient } from "@lhm/database";
import { Worker } from "bullmq";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { QueueName } from "../queues/queueNames.js";
import type { HeartbeatController } from "./heartbeat.js";

export interface RegisteredWorkerConfig {
  queueName: QueueName;
  connection: Redis;
  concurrency: number;
  /** Unique name registered in the worker table for monitoring. */
  workerName: string;
  logger: Logger;
  heartbeat: HeartbeatController;
  processor: (job: Job) => Promise<void>;
}

/**
 * Attaches a BullMQ worker, tracking per-job status and counters in the
 * worker table. Failed jobs are re-thrown so BullMQ applies its retry
 * strategy; errors are logged with full context.
 */
export function registerWorker(config: RegisteredWorkerConfig): Worker {
  const { queueName, connection, concurrency, workerName, logger, heartbeat, processor } = config;
  const prisma = getPrismaClient();

  const worker = new Worker(
    queueName,
    async (job) => {
      await heartbeat.markBusy();
      try {
        await processor(job);
        await prisma.worker
          .update({
            where: { name: workerName },
            data: {
              jobsCompleted: { increment: 1 },
              lastJobId: job.id,
              lastHeartbeat: new Date(),
            },
          })
          .catch(() => {});
      } catch (error) {
        await prisma.worker
          .update({
            where: { name: workerName },
            data: {
              jobsFailed: { increment: 1 },
              lastJobId: job.id,
            },
          })
          .catch(() => {});
        throw error;
      } finally {
        await heartbeat.markIdle();
      }
    },
    { connection, concurrency },
  );

  worker.on("failed", (job, error) => {
    logger.error(
      { jobId: job?.id, error: error instanceof Error ? error.message : error },
      "job failed",
    );
  });

  worker.on("error", (error) => {
    logger.error({ error: error instanceof Error ? error.message : error }, "bullmq worker error");
  });

  return worker;
}
