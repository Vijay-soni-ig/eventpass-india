import { Router } from "express";
import { z } from "zod";
import { verifyToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { authSessionMutationRateLimit } from "../middleware/rateLimit";
import { revokeAllUserSessions, revokeAuthSession } from "../lib/authSession";

function currentJti(req: Parameters<typeof requireAuth>[0]): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(header.slice(7).trim()).jti;
  } catch {
    return null;
  }
}

const router = Router();

router.get("/sessions", requireAuth, async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{
    jti: string;
    created_at: Date;
    last_used_at: Date;
    expires_at: Date;
  }>>`
    SELECT "jti", "created_at", "last_used_at", "expires_at"
    FROM "auth_sessions"
    WHERE "user_id" = ${req.user!.id}
      AND "revoked_at" IS NULL
      AND "expires_at" > CURRENT_TIMESTAMP
    ORDER BY "last_used_at" DESC
  `;

  const activeJti = currentJti(req);
  res.json({
    sessions: rows.map((row) => ({
      id: row.jti,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      current: row.jti === activeJti,
    })),
  });
});

const jtiSchema = z.string().trim().min(1).max(200);

router.delete("/sessions/:jti", requireAuth, authSessionMutationRateLimit, async (req, res) => {
  const parsed = jtiSchema.safeParse(req.params.jti);
  if (!parsed.success) return res.status(400).json({ error: "Invalid session" });

  const activeJti = currentJti(req);
  if (parsed.data === activeJti) {
    return res.status(400).json({ error: "Use sign out to end the current session" });
  }

  const result = await prisma.$executeRaw`
    UPDATE "auth_sessions"
    SET "revoked_at" = COALESCE("revoked_at", CURRENT_TIMESTAMP)
    WHERE "user_id" = ${req.user!.id}
      AND "jti" = ${parsed.data}
      AND "revoked_at" IS NULL
  `;

  if (result === 0) return res.status(404).json({ error: "Session not found" });
  res.status(204).send();
});

router.post("/sessions/revoke-others", requireAuth, authSessionMutationRateLimit, async (req, res) => {
  const activeJti = currentJti(req);
  if (!activeJti) return res.status(401).json({ error: "Current session could not be identified" });

  const revoked = await prisma.$executeRaw`
    UPDATE "auth_sessions"
    SET "revoked_at" = COALESCE("revoked_at", CURRENT_TIMESTAMP)
    WHERE "user_id" = ${req.user!.id}
      AND "jti" <> ${activeJti}
      AND "revoked_at" IS NULL
  `;

  res.json({ revokedCount: revoked });
});

export default router;
