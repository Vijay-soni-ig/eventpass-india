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

  // First-time exhibition creation intentionally bootstraps the user's
  // Organizer tenant inside routes/exhibitions.ts via resolveOrganizerId().
  // Keep this narrow: only an authenticated POST to the exact collection
  // endpoint may pass without an existing Organizer membership. Every other
  // Organizer route still requires a real membership before reaching its
  // handler.
  if (req.method === "POST" && req.baseUrl === "/api/exhibitions" && req.path === "/") {
    return next();
  }

  // The organizer visitors endpoint is intentionally an authenticated,
  // empty-for-non-organizers read. Its handler scopes results through
  // organizerIdsWithPermission(); allowing the request to reach that handler
  // preserves the existing non-leaking empty-list contract without granting
  // any organizer tenant access.
  if (req.method === "GET" && req.baseUrl === "/api/bookings" && req.path === "/tickets") {
    return next();
  }

  return res.status(403).json({ error: "Organizer access required" });
}

export async function requireExhibitorBusinessAccess(req: Request, res: Response, next: NextFunction) {
  if (await hasAnyExhibitorMembership(req.user!.id)) {
    return next();
  }

  // First-time exhibitor application intentionally bootstraps the user's
  // ExhibitorBusiness tenant inside routes/exhibitorParticipations.ts via
  // resolveExhibitorBusinessId(). Keep this exception narrow: only an
  // authenticated POST to the exact application collection endpoint may
  // pass without an existing ExhibitorMembership. All other exhibitor
  // routes still require a real membership before reaching their handlers.
  if (req.method === "POST" && req.baseUrl === "/api/exhibitor/participations" && req.path === "/") {
    return next();
  }

  return res.status(403).json({ error: "Exhibitor access required" });
}

// First-use exhibitor business setup is a controlled bootstrap operation.
// Only an account registered as an exhibitor and with no existing exhibitor
// membership may enter this gate without membership. This is deliberately
// separate from requireExhibitorBusinessAccess so a pure organizer/visitor
// can never create or mutate an exhibitor tenant merely by calling a profile
// endpoint.
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
