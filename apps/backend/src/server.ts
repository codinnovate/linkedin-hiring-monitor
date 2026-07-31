import { disconnectPrisma } from "@lhm/database";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

// Load repo-root .env during local development; a no-op when the file is
// absent (e.g. container deployments that inject env directly).
try {
  process.loadEnvFile("../../.env");
} catch {
  // .env is optional; environment variables may already be set
}

const env = loadEnv();
const app = await buildApp({ env });

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`backend listening on http://${env.HOST}:${env.PORT}`);
} catch (error) {
  app.log.error({ error }, "failed to start backend");
  process.exit(1);
}
