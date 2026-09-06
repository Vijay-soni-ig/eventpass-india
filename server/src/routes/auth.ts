import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { serializeUser } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { getRoleContext } from "../lib/access";

// No brute-force/lockout protection existed on these endpoints — unlimited
// password guesses and signup spam were both possible from a single IP.
// Keyed by IP (the default) since these routes run before requireAuth.
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

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
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

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, userType },
  });

  const token = signToken({ userId: user.id });
  res.status(201).json({ token, user: await withRoles(user) });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", authRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
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

  const token = signToken({ userId: user.id });
  res.json({ token, user: await withRoles(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await withRoles(req.user!) });
});

export default router;
