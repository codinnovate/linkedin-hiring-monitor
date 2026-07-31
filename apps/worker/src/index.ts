import { disconnectPrisma } from "@lhm/database";
import { hostname } from "node:os";
import pino from "pino";
import { loadEnv } from "./config/env.js";
import { createQueueRedis, createWorkerRedis } from "./queues/connection.js";
import { closeAllQueues, getQueue } from "./queues/index.js";
import { QUEUES } from "./queues/queueNames.js";
import { startScheduler } from "./scheduler.js";
import { startHeartbeat } from "./workers/heartbeat.js";
import { registerWorker } from "./workers/registry.js";
import { createSearchProcessor } from "./workers/search.worker.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // .env is optional; environment variables may already be set
}

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });

const workerName = process.env.WORKER_NAME ?? `worker-${hostname()}-${process.pid}`;

let stopping = false;

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down");
  try {
    await heartbeat.stop();
    await stopScheduler();
    await searchWorker.close();
    await closeAllQueues();
    await disconnectPrisma();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const queueRedis = createQueueRedis(env.REDIS_URL);
const workerRedis = createWorkerRedis(env.REDIS_URL);

queueRedis.on("error", (error) => logger.error({ error }, "queue redis error"));
workerRedis.on("error", (error) => logger.error({ error }, "worker redis error"));

await queueRedis.ping();
await workerRedis.ping();
logger.info("redis connections established");

const searchQueue = getQueue(QUEUES.SEARCH, queueRedis);

const heartbeat = await startHeartbeat({ name: workerName, type: "playwright", logger });

const searchWorker = registerWorker({
  queueName: QUEUES.SEARCH,
  connection: workerRedis,
  concurrency: env.WORKER_CONCURRENCY,
  workerName,
  logger,
  heartbeat,
  processor: createSearchProcessor(env, workerName, logger),
});

const stopScheduler = await startScheduler({ env, queue: searchQueue, logger });

logger.info(
  {
    workerName,
    concurrency: env.WORKER_CONCURRENCY,
    headless: env.PLAYWRIGHT_HEADLESS,
    searchCron: env.SEARCH_CRON,
  },
  "worker ready",
);
