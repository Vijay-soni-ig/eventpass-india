import { Request, Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signToken, verifyToken } from "../lib/jwt";
import { createAuthSession, pruneExpiredAuthSessions, revokeAllUserSessions, revokeAuthSession } from "../lib/authSession";
import { serializeUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { getRoleContext } from "../lib/access";
import { resolveOrganizerId } from "../lib/organizer";
import { getOnboardingSummary } from "../lib/onboarding";
import { authSessionMutationRateLimit } from "../middleware/rateLimit";

function requestIp(req: Request): string {
  return req.ip ?? "";
}

function authRateLimitKey(req: Request): string {
  if (process.env.NODE_ENV === "test") {
    const testKey = req.get("X-Test-Rate-Limit-Key");
    if (testKey) return testKey;
  }
  return ipKeyGenerator(requestIp(req));
}

async function withRoles(user: Parameters<typeof serializeUser>[0]) {
  const roles = await getRoleContext(user);
  const onboarding = await getOnboardingSummary(user, roles);
  return { ...serializeUser(user), roles, onboarding };
}

async function issueSession(userId: string): Promise<string> {
  const token = signToken({ userId });
  const payload = verifyToken(token);
  await createAuthSession(userId, token, payload.jti);
  void pruneExpiredAuthSessions().catch(() => undefined);
  return token;
}

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateLimitKey,
  message: { error: "Too many attempts. Please try again later." },
});

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
  userType: z.enum(["visitor", "exhibitor", "organizer"]),
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

  if (userType === "organizer") {
    await resolveOrganizerId(user.id);
  }

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

router.post("/logout", requireAuth, authSessionMutationRateLimit, async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
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

router.post("/logout-all", requireAuth, authSessionMutationRateLimit, async (req, res) => {
  await revokeAllUserSessions(req.user!.id);
  res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await withRoles(req.user!) });
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(200),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^[0-9+()\-\s]*$/, "Phone number contains invalid characters")
    .nullish()
    .transform((v) => (v ? v : null)),
});

router.patch("/me", requireAuth, authSessionMutationRateLimit, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { fullName: parsed.data.fullName, phone: parsed.data.phone },
  });
  res.json({ user: await withRoles(user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: passwordSchema,
});

// Changing the password revokes every existing session (including this one)
// and returns a fresh token so the caller stays signed in on this device only.
router.post("/change-password", requireAuth, authRateLimit, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { currentPassword, newPassword } = parsed.data;

  const valid = await bcrypt.compare(currentPassword, req.user!.passwordHash);
  if (!valid) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: "New password must be different from the current password" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });
  await revokeAllUserSessions(req.user!.id);
  const token = await issueSession(req.user!.id);
  res.json({ token });
});

export default router;
