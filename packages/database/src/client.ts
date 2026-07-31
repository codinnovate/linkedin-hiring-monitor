import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;

/** Returns a shared PrismaClient instance (singleton per process). */
export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["warn", "error"],
    });
  }
  return client;
}

/** Creates an isolated client, e.g. for tests or multi-tenant workloads. */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: ["warn", "error"],
  });
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

export type { Prisma, PrismaClient } from "@prisma/client";
