import { getPrismaClient } from "@lhm/database";
import type { Logger } from "pino";

export interface HeartbeatController {
  /** Marks the worker offline and stops the heartbeat timer. */
  stop(): Promise<void>;
  markBusy(): Promise<void>;
  markIdle(): Promise<void>;
  /** Marks an error state and keeps heartbeating. */
  markError(message: string): Promise<void>;
}

export interface StartHeartbeatOptions {
  name: string;
  type?: string;
  logger?: Logger;
  intervalMs?: number;
}

/**
 * Registers a worker row and starts sending heartbeats to the database.
 * Returns a controller used to flip status and eventually mark offline.
 */
export async function startHeartbeat({
  name,
  type = "playwright",
  logger,
  intervalMs = 30_000,
}: StartHeartbeatOptions): Promise<HeartbeatController> {
  const prisma = getPrismaClient();

  await prisma.worker.upsert({
    where: { name },
    update: {
      status: "IDLE",
      lastHeartbeat: new Date(),
      metadata: { pid: process.pid, startedAt: new Date().toISOString() },
    },
    create: {
      name,
      type,
      status: "IDLE",
      lastHeartbeat: new Date(),
      metadata: { pid: process.pid, startedAt: new Date().toISOString() },
    },
  });

  const beat = async (): Promise<void> => {
    try {
      await prisma.worker.update({
        where: { name },
        data: { lastHeartbeat: new Date() },
      });
    } catch (error) {
      logger?.warn({ error }, "heartbeat update failed");
    }
  };

  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();

  return {
    stop: async () => {
      clearInterval(timer);
      try {
        await prisma.worker.update({
          where: { name },
          data: { status: "OFFLINE" },
        });
      } catch (error) {
        logger?.warn({ error }, "failed to mark worker offline");
      }
    },
    markBusy: async () => {
      try {
        await prisma.worker.update({ where: { name }, data: { status: "BUSY" } });
      } catch {
        // best-effort status update
      }
    },
    markIdle: async () => {
      try {
        await prisma.worker.update({ where: { name }, data: { status: "IDLE" } });
      } catch {
        // best-effort status update
      }
    },
    markError: async (message: string) => {
      try {
        await prisma.worker.update({
          where: { name },
          data: { status: "ERROR", metadata: { error: message, at: new Date().toISOString() } },
        });
      } catch {
        // best-effort status update
      }
    },
  };
}
