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

  if (req.method === "POST" && req.baseUrl === "/api/exhibitions" && req.path === "/") {
    return next();
  }

  // This read intentionally returns an empty dataset for non-organizers; the
  // handler scopes results through organizerIdsWithPermission(), so allowing
  // it through does not grant organizer tenant access.
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

  // First-use exhibitor business/profile setup is intentionally narrow. Only
  // an account registered as an exhibitor may bootstrap its own business;
  // organizers and visitors can never create an exhibitor tenant here.
  if (
    req.user!.userType === "exhibitor" &&
    req.baseUrl === "/api/exhibitor/business" &&
    ((req.method === "PUT" && req.path === "/") || (req.method === "POST" && req.path === "/logo"))
  ) {
    return next();
  }

  // Scanner handlers enforce confirmed participation and return 404 when the
  // exhibitor is not attached to the exhibition. Preserve that resource-boundary
  // behavior rather than converting it to a blanket tenant 403.
  if (req.user!.userType === "exhibitor" && req.baseUrl === "/api/exhibitor/scanner") {
    return next();
  }

  return res.status(403).json({ error: "Exhibitor access required" });
}

// Kept as a dedicated export for routes that want to make first-use business
// setup explicit. Existing routes may use the narrower access gate above.
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
