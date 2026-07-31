import fastifyCors from "@fastify/cors";
import Fastify from "fastify";
import type { FastifyServerOptions } from "fastify";
import { createAuth } from "./auth/auth.js";
import { authPlugin } from "./auth/plugin.js";
import type { Env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";

export interface BuildAppOptions {
  env: Env;
  fastifyOptions?: FastifyServerOptions;
}

/** Builds the Fastify application with all plugins and routes registered. */
export async function buildApp({
  env,
  fastifyOptions,
}: BuildAppOptions): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ["authorization", "cookie", "*.password", "*.token", "*.secret"],
    },
    ...fastifyOptions,
  });

  app.decorate("env", env);

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow no-origin requests (curl, health checks) and configured origins.
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin not allowed"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86_400,
  });

  const auth = createAuth(env);
  await app.register(authPlugin, { auth, secret: env.BETTER_AUTH_SECRET });

  await app.register(healthRoutes);

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}
