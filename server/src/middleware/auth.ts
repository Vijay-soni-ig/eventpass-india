import { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt";
import { validateAuthSession } from "../lib/authSession";
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
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = verifyToken(token);
    const sessionValid = await validateAuthSession(payload.userId, payload.jti, token);
    if (!sessionValid) {
      return res.status(401).json({ error: "Session is invalid or has expired" });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (user.suspended) {
      return res.status(403).json({ error: "This account has been suspended" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireOrganizerAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyOrganizerMembership(req.user!.id)) {
    return next();
  }

  if (req.method === "POST" && req.baseUrl === "/api/exhibitions" && req.path === "/") {
    return next();
  }

  if (req.method === "GET" && req.baseUrl === "/api/bookings" && req.path === "/tickets") {
    return next();
  }

  return res.status(403).json({ error: "Organizer access required" });
}

export async function requireExhibitorBusinessAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyExhibitorMembership(req.user!.id)) {
    return next();
  }

  if (req.method === "POST" && req.baseUrl === "/api/exhibitor/participations" && req.path === "/") {
    return next();
  }

  if (
    req.user!.userType === "exhibitor" &&
    req.baseUrl === "/api/business" &&
    ((req.method === "PUT" && req.path === "/") || (req.method === "POST" && req.path === "/logo"))
  ) {
    return next();
  }

  if (req.user!.userType === "exhibitor" && req.baseUrl === "/api/exhibitor/scanner") {
    return next();
  }

  return res.status(403).json({ error: "Exhibitor access required" });
}

export async function requireExhibitorBusinessBootstrapAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyExhibitorMembership(req.user!.id)) {
    return next();
  }
  if (req.user!.userType === "exhibitor") {
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
