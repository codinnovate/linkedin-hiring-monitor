import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const env = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  LOG_LEVEL: "silent" as const,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgresql://lhm:lhm_password@localhost:5432/lhm_test?schema=public",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  BETTER_AUTH_SECRET: "integration-test-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGINS: ["http://localhost:3000"],
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  OPENAI_API_KEY: undefined,
};

const uniqueEmail = `auth-test-${Date.now()}@example.com`;
const password = "correct-horse-battery";
const SESSION_COOKIE_NAME = "lhm.session_token";

function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  return sessionCookie ? (sessionCookie.split(";")[0] ?? null) : null;
}

describe("authentication (integration)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // getPrismaClient reads process.env, not the app env object, so pin the
    // test database for this process before the app builds its auth client.
    process.env.DATABASE_URL = env.DATABASE_URL;
    app = await buildApp({ env });
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unauthenticated /api/me", async () => {
    const response = await app.inject({ method: "GET", url: "/api/me" });
    expect(response.statusCode).toBe(401);
  });

  it("signs up a new user and returns a session cookie", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { email: uniqueEmail, password, name: "Test User" },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.user.email).toBe(uniqueEmail);
    expect(body.user.role).toBe("USER");
    expect(extractSessionCookie(response.headers["set-cookie"])).toBeTruthy();
  });

  it("signs in with credentials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: uniqueEmail, password },
    });
    expect(response.statusCode).toBe(200);
    expect(extractSessionCookie(response.headers["set-cookie"])).toBeTruthy();
  });

  it("returns the authenticated user via session cookie", async () => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: uniqueEmail, password },
    });
    const cookie = extractSessionCookie(signIn.headers["set-cookie"]);
    expect(cookie).toBeTruthy();

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: cookie! },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(uniqueEmail);
  });

  it("rejects sign-in with a wrong password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: uniqueEmail, password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("issues and validates a stateless access token", async () => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: uniqueEmail, password },
    });
    const cookie = extractSessionCookie(signIn.headers["set-cookie"]);
    expect(cookie).toBeTruthy();

    const issue = await app.inject({
      method: "POST",
      url: "/api/auth/access-token",
      headers: { cookie: cookie! },
    });
    expect(issue.statusCode).toBe(200);
    const { token, type, expiresIn } = issue.json();
    expect(typeof token).toBe("string");
    expect(type).toBe("access");
    expect(expiresIn).toBeGreaterThan(0);

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(uniqueEmail);
  });

  it("rejects a tampered access token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { authorization: "Bearer tampered.token.value" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("signs out and invalidates the session", async () => {
    const signIn = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: uniqueEmail, password },
    });
    const cookie = extractSessionCookie(signIn.headers["set-cookie"]);
    expect(cookie).toBeTruthy();

    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie: cookie! },
    });
    expect(signOut.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: cookie! },
    });
    expect(me.statusCode).toBe(401);
  });
});
