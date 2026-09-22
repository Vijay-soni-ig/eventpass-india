import jwt from "jsonwebtoken";
import crypto from "node:crypto";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "8h";
const JWT_ISSUER = process.env.JWT_ISSUER ?? "exhibittix";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "exhibittix-app";
const MAX_JWT_LIFETIME_SECONDS = 24 * 60 * 60;

function getJwtLifetimeSeconds(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (!match) {
    throw new Error("JWT_EXPIRES_IN must use a numeric s, m, h, or d duration");
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 60 * 60 : 24 * 60 * 60;
  const seconds = amount * multiplier;

  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_JWT_LIFETIME_SECONDS) {
    throw new Error("JWT_EXPIRES_IN must be greater than 0 and no more than 24h");
  }

  return seconds;
}

getJwtLifetimeSeconds(JWT_EXPIRES_IN);

export interface TokenPayload {
  userId: string;
  jti: string;
}

export function signToken(payload: { userId: string }): string {
  return jwt.sign(
    { userId: payload.userId },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtid: crypto.randomUUID(),
      algorithm: "HS256",
    },
  );
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as jwt.JwtPayload & { userId?: string };

  if (typeof payload.userId !== "string" || typeof payload.jti !== "string") {
    throw new Error("Invalid token claims");
  }

  return { userId: payload.userId, jti: payload.jti };
}
