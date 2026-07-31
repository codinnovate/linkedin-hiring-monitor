import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Auth, AuthUser } from "./auth.js";
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken, verifyAccessToken } from "./jwt.js";

export interface AuthPluginOptions {
  auth: Auth;
  /** Secret used to sign stateless API access tokens. */
  secret: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }

  interface FastifyInstance {
    auth: Auth;
    secret: string;
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
    requireRole: (
      role: string,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}

/** Rebuilds a Fetch API Request from a Fastify request (body already parsed). */
function toFetchRequest(request: FastifyRequest): Request {
  const baseUrl = `http://${request.headers.host ?? "localhost"}`;
  const headers = fromNodeHeaders(request.headers);
  return new Request(new URL(request.url, baseUrl).toString(), {
    method: request.method,
    headers,
    ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
  });
}

async function resolveAuthUser(
  auth: Auth,
  secret: string,
  request: FastifyRequest,
): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (session) {
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
      role: (session.user as { role?: string }).role ?? "USER",
    };
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    const claims = verifyAccessToken(secret, authorization.slice("Bearer ".length));
    if (claims) {
      return {
        id: claims.sub,
        email: claims.email,
        name: null,
        image: null,
        role: claims.role,
      };
    }
  }
  return null;
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const user = await resolveAuthUser(request.server.auth, request.server.secret, request);
  if (!user) {
    return reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  request.authUser = user;
  return undefined;
}

function requireRole(role: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    if (request.authUser?.role !== role) {
      return reply.code(403).send({
        error: "FORBIDDEN",
        message: "Insufficient permissions",
      });
    }
    return undefined;
  };
}

/**
 * Mounts BetterAuth's /api/auth/* handler plus authenticated API helpers
 * (GET /api/me, POST /api/auth/access-token) and the requireAuth /
 * requireRole pre-handlers.
 */
export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  const { auth, secret } = options;

  app.decorate("auth", auth);
  app.decorate("secret", secret);
  app.decorate("requireAuth", requireAuth);
  app.decorate("requireRole", requireRole);

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      try {
        const response = await auth.handler(toFetchRequest(request));
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        const text = response.body ? await response.text() : null;
        return reply.send(text);
      } catch (error) {
        app.log.error({ error }, "better-auth handler failed");
        return reply.status(500).send({
          error: "AUTH_FAILURE",
          message: "Internal authentication error",
        });
      }
    },
  });

  app.get("/api/me", { preHandler: [requireAuth] }, async (request) => {
    return { user: request.authUser };
  });

  app.post("/api/auth/access-token", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
    }
    const token = signAccessToken(secret, {
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      token,
      type: "access",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  });
};
