import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signToken, verifyToken } from "../lib/jwt";
import { createAuthSession, pruneExpiredAuthSessions, revokeAllUserSessions, revokeAuthSession } from "../lib/authSession";
import { serializeUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { getRoleContext } from "../lib/access";

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...(process.env.NODE_ENV === "test"
    ? {
        keyGenerator: (req: Parameters<NonNullable<Parameters<typeof rateLimit>[0]["keyGenerator"]>>[0]) =>
          req.get("X-Test-Rate-Limit-Key") || req.ip,
      }
    : {}),
  message: { error: "Too many attempts. Please try again later." },
});

async function withRoles(user: Parameters<typeof serializeUser>[0]) {
  return { ...serializeUser(user), roles: await getRoleContext(user) };
}

async function issueSession(userId: string): Promise<string> {
  const token = signToken({ userId });
  const payload = verifyToken(token);
  await createAuthSession(userId, token, payload.jti);
  void pruneExpiredAuthSessions().catch(() => undefined);
  return token;
}