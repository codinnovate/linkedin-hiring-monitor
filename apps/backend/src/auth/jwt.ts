import jwt from "jsonwebtoken";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  type: "access";
}

const ISSUER = "lhm-backend";
const ALGORITHM = "HS256";
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/** Signs a short-lived stateless access token for API clients. */
export function signAccessToken(secret: string, claims: Omit<AccessTokenClaims, "type">): string {
  return jwt.sign({ ...claims, type: "access" }, secret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
  });
}

/** Verifies an access token. Returns null on any failure. */
export function verifyAccessToken(secret: string, token: string): AccessTokenClaims | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
    });
    if (typeof decoded === "string" || decoded.type !== "access") return null;
    return {
      sub: String(decoded.sub ?? ""),
      email: String(decoded.email ?? ""),
      role: String(decoded.role ?? "USER"),
      type: "access",
    };
  } catch {
    return null;
  }
}
