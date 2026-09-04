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
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireExhibitor(req: Request, res: Response, next: NextFunction) {
  if (req.user?.userType !== "exhibitor") {
    return res.status(403).json({ error: "Exhibitor access required" });
  }
  next();
}

// requireExhibitor is a coarse, userType-only pre-filter — kept only for
// the legacy /api/team-members route. Every other tenant-scoped route uses
// one of the two guards below instead, which also admit a user who was
// invited into an Organizer/ExhibitorBusiness membership regardless of
// their signup-time userType flag. None of these grant any permission by
// themselves — they're just the entry gate; every route beyond them still
// checks real membership roles through the centralized can() system.

export async function requireOrganizerAccess(req: Request, res: Response, next: NextFunction) {
  if (req.user?.userType === "exhibitor" || (await hasAnyOrganizerMembership(req.user!.id))) {
    return next();
  }
  return res.status(403).json({ error: "Organizer access required" });
}

export async function requireExhibitorBusinessAccess(req: Request, res: Response, next: NextFunction) {
  if (req.user?.userType === "exhibitor" || (await hasAnyExhibitorMembership(req.user!.id))) {
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
