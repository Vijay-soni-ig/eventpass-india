import crypto from "node:crypto";
import { prisma } from "./prisma";

const SESSION_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAuthSession(userId: string, token: string, jti: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.$executeRaw`
    INSERT INTO "auth_sessions" ("id", "user_id", "jti", "token_hash", "expires_at")
    VALUES (${crypto.randomUUID()}, ${userId}, ${jti}, ${hashToken(token)}, ${expiresAt})
  `;
}

export async function validateAuthSession(userId: string, jti: string, token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "auth_sessions"
    WHERE "user_id" = ${userId}
      AND "jti" = ${jti}
      AND "token_hash" = ${tokenHash}
      AND "revoked_at" IS NULL
      AND "expires_at" > CURRENT_TIMESTAMP
    LIMIT 1
  `;

  if (rows.length === 0) return false;

  await prisma.$executeRaw`
    UPDATE "auth_sessions"
    SET "last_used_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${rows[0].id}
  `;
  return true;
}

export async function revokeAuthSession(jti: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "auth_sessions"
    SET "revoked_at" = COALESCE("revoked_at", CURRENT_TIMESTAMP)
    WHERE "jti" = ${jti}
  `;
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "auth_sessions"
    SET "revoked_at" = COALESCE("revoked_at", CURRENT_TIMESTAMP)
    WHERE "user_id" = ${userId} AND "revoked_at" IS NULL
  `;
}

export async function pruneExpiredAuthSessions(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "auth_sessions"
    WHERE "expires_at" < CURRENT_TIMESTAMP
       OR "revoked_at" < CURRENT_TIMESTAMP - INTERVAL '30 days'
  `;
}
