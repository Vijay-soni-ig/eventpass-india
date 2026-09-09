import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { hasAnyOrganizerMembership, hasAnyExhibitorMembership } from "../lib/access";
import type { User } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    // Takes effect immediately for an already-issued token, unlike a
    // login-time-only check — mirrors how a suspended Organizer/
    // ExhibitorBusiness already blocks its members at every request (see
    // access.ts), not just at their next sign-in.
    if (user.suspended) {
      return res.status(403).json({ error: "This account has been suspended" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Tenant entry gates are membership-based, not signup-userType-based.
// A user's userType describes how they originally registered; it must never
// become a privilege-escalation shortcut into a different tenant axis.
// Actual CRUD authorization remains permission-scoped by the centralized
// can() system in access.ts.
export async function requireOrganizerAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyOrganizerMembership(req.user!.id)) {
    return next();
  }

  // First-time exhibition creation intentionally bootstraps the user's
  // Organizer tenant inside routes/exhibitions.ts via resolveOrganizerId().
  // Keep this narrow: only an authenticated POST to the exact collection
  // endpoint may pass without an existing Organizer membership. Every other
  // Organizer route still requires a real membership before reaching its
  // handler, preserving the Phase 23.5 authorization boundary.
  if (req.method === "POST" && req.baseUrl === "/api/exhibitions" && req.path === "/") {
    return next();
  }

  return res.status(403).json({ error: "Organizer access required" });
}

export async function requireExhibitorBusinessAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyExhibitorMembership(req.user!.id)) {
    return next();
  }
  return res.status(403).json({ error: "Exhibitor access required" });
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Platform admin access required" });
  }
  next();
}
