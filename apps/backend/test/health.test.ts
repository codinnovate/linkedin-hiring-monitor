import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const testEnv = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  LOG_LEVEL: "silent" as const,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test?schema=public",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-1234567890",
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGINS: ["http://localhost:3000"],
};

describe("backend app", () => {
  it("responds on /health", async () => {
    const app = await buildApp({ env: testEnv });

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("linkedin-hiring-monitor-backend");
    expect(typeof body.uptimeSeconds).toBe("number");

    await app.close();
  });

  it("returns 404 for unknown routes", async () => {
    const app = await buildApp({ env: testEnv });
    const response = await app.inject({ method: "GET", url: "/nope" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
