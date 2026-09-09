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

const router = Router();

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character");

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(200),
  userType: z.enum(["visitor", "exhibitor"]),
});

router.post("/signup", authRateLimit, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password, fullName, userType } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, userType },
  });

  const token = await issueSession(user.id);
  res.status(201).json({ token, user: await withRoles(user) });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

router.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  if (user.suspended) {
    return res.status(403).json({ error: "This account has been suspended" });
  }

  const token = await issueSession(user.id);
  res.json({ token, user: await withRoles(user) });
});

router.post("/logout", requireAuth, async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (token) {
    try {
      const payload = verifyToken(token);
      await revokeAuthSession(payload.jti);
    } catch {
      // requireAuth already validated the current token; keep logout idempotent.
    }
  }
  res.status(204).send();
});

router.post("/logout-all", requireAuth, async (req, res) => {
  await revokeAllUserSessions(req.user!.id);
  res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await withRoles(req.user!) });
});

export default router;
