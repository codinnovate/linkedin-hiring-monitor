import Redis from "ioredis";

/** Creates a dedicated ioredis connection for BullMQ queues. */
export function createQueueRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

/** Creates a dedicated ioredis connection for BullMQ workers. */
export function createWorkerRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/** Creates a standalone connection, e.g. for health checks or pub/sub. */
export function createPlainRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
  });
}
