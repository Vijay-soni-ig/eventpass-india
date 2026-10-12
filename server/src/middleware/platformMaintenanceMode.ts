import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const BYPASS_PREFIXES = ["/api/health", "/api/auth", "/api/platform"];

/**
 * Platform maintenance is an operational gate, not an authorization boundary.
 * Authentication and health endpoints remain available so administrators can
 * sign in and recover the platform. Platform routes remain available but still
 * enforce their own authentication/RBAC middleware.
 */
export async function enforcePlatformMaintenanceMode(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "OPTIONS" || !req.path.startsWith("/api/")) return next();
  if (BYPASS_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return next();
  }

  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { maintenanceMode: true, maintenanceMessage: true },
    });

    if (!settings?.maintenanceMode) return next();

    const message = settings.maintenanceMessage?.trim() ||
      "ExhibitTix is temporarily unavailable while maintenance is in progress.";

    res.setHeader("Retry-After", "300");
    return res.status(503).json({
      error: message,
      code: "PLATFORM_MAINTENANCE",
      maintenanceMode: true,
    });
  } catch (error) {
    // Do not silently bypass an enabled maintenance gate when its persisted
    // state cannot be read. The global error handler will log and return 500.
    return next(error);
  }
}
