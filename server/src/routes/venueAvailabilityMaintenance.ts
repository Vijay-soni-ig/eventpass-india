import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { exhibitionMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const uuid = z.string().uuid();
const availabilityStatus = z.enum(["active", "inactive", "archived"]);
const availabilityType = z.enum(["closed", "reserved", "unavailable", "other"]);
const maintenanceStatus = z.enum(["scheduled", "in_progress", "completed", "cancelled", "archived"]);
const maintenanceType = z.enum(["inspection", "cleaning", "repair", "upgrade", "safety", "other"]);

const dateRange = {
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
};

const availabilityCreateBase = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
  type: availabilityType.default("closed"),
  floorId: uuid.nullable().optional(),
  spaceId: uuid.nullable().optional(),
  ...dateRange,
});
const availabilityCreate = availabilityCreateBase.superRefine((v, ctx) => {
  if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
});
const availabilityUpdateBase = availabilityCreateBase.partial().extend({ status: availabilityStatus.optional() });
const availabilityUpdate = availabilityUpdateBase.superRefine((v, ctx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
});

const maintenanceCreateBase = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
  type: maintenanceType.default("inspection"),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
  floorId: uuid.nullable().optional(),
  spaceId: uuid.nullable().optional(),
  ...dateRange,
});
const maintenanceCreate = maintenanceCreateBase.superRefine((v, ctx) => {
  if (v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
});
const maintenanceUpdateBase = maintenanceCreateBase.partial().extend({ status: maintenanceStatus.optional() });
const maintenanceUpdate = maintenanceUpdateBase.superRefine((v, ctx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time." });
});

async function assertLocation(venueId: string, floorId?: string | null, spaceId?: string | null) {
  if (!floorId && !spaceId) return;
  if (floorId) {
    const floor = await prisma.venueFloor.findFirst({
      where: {
        id: floorId,
        status: { not: "archived" },
        building: { status: { not: "archived" }, venueId },
      },
      select: { id: true },
    });
    if (!floor) throw new Error("INVALID_FLOOR");
  }
  if (spaceId) {
    const space = await prisma.venueSpace.findFirst({
      where: {
        id: spaceId,
        status: { not: "archived" },
        zone: {
          status: { not: "archived" },
          floor: {
            status: { not: "archived" },
            building: { status: { not: "archived" }, venueId },
          },
        },
      },
      select: { id: true, zone: { select: { floorId: true } } },
    });
    if (!space) throw new Error("INVALID_SPACE");
    if (floorId && space.zone.floorId !== floorId) throw new Error("LOCATION_MISMATCH");
  }
}

async function canAccessVenue(req: import("express").Request, venueId: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIdsWithPermission(req.user!, permission);
  if (ids.length === 0) return false;
  const venue = await prisma.venue.findFirst({ where: { id: venueId, organizerId: { in: ids } }, select: { id: true, organizerId: true } });
  return !!venue;
}

async function canAccessBlock(req: import("express").Request, id: string, permission: "venue:view" | "venue:manage", kind: "availability" | "maintenance") {
  const ids = await organizerIdsWithPermission(req.user!, permission);
  if (ids.length === 0) return false;
  const row = kind === "availability"
    ? await prisma.venueAvailabilityBlock.findFirst({ where: { id, venue: { organizerId: { in: ids } } }, select: { id: true, venueId: true } })
    : await prisma.venueMaintenanceBlock.findFirst({ where: { id, venue: { organizerId: { in: ids } } }, select: { id: true, venueId: true } });
  return row;
}

function sendLocationError(res: import("express").Response, error: unknown) {
  if (error instanceof Error && error.message === "INVALID_FLOOR") return res.status(400).json({ error: "Invalid or archived floor for this venue." });
  if (error instanceof Error && error.message === "INVALID_SPACE") return res.status(400).json({ error: "Invalid or archived space for this venue." });
  if (error instanceof Error && error.message === "LOCATION_MISMATCH") return res.status(400).json({ error: "Space must belong to the selected floor." });
  return null;
}

router.get("/availability/venues/:venueId", async (req, res) => {
  if (!(await canAccessVenue(req, req.params.venueId, "venue:view"))) return res.status(404).json({ error: "Venue not found" });
  const status = availabilityStatus.safeParse(req.query.status);
  const where = {
    venueId: req.params.venueId,
    ...(status.success ? { status: status.data } : { status: { not: "archived" as const } }),
    ...(typeof req.query.from === "string" ? { endsAt: { gt: new Date(req.query.from) } } : {}),
    ...(typeof req.query.to === "string" ? { startsAt: { lt: new Date(req.query.to) } } : {}),
  };
  const blocks = await prisma.venueAvailabilityBlock.findMany({ where, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }] });
  return res.json({ blocks });
});

router.post("/availability/venues/:venueId", exhibitionMutationRateLimit, async (req, res) => {
  if (!(await canAccessVenue(req, req.params.venueId, "venue:manage"))) return res.status(404).json({ error: "Venue not found" });
  const parsed = availabilityCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    await assertLocation(req.params.venueId, parsed.data.floorId, parsed.data.spaceId);
    const block = await prisma.venueAvailabilityBlock.create({ data: { venueId: req.params.venueId, ...parsed.data } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.availability.create", entityType: "VenueAvailabilityBlock", entityId: block.id, metadata: { venueId: block.venueId, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString() } });
    return res.status(201).json({ block });
  } catch (error) {
    const handled = sendLocationError(res, error); if (handled) return handled;
    throw error;
  }
});

router.get("/availability/:id", async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:view", "availability");
  if (!row) return res.status(404).json({ error: "Availability block not found" });
  return res.json({ block: await prisma.venueAvailabilityBlock.findUnique({ where: { id: req.params.id } }) });
});

router.patch("/availability/:id", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "availability");
  if (!row) return res.status(404).json({ error: "Availability block not found" });
  const parsed = availabilityUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await prisma.venueAvailabilityBlock.findUniqueOrThrow({ where: { id: req.params.id } });
  const nextFloor = parsed.data.floorId !== undefined ? parsed.data.floorId : current.floorId;
  const nextSpace = parsed.data.spaceId !== undefined ? parsed.data.spaceId : current.spaceId;
  const startsAt = parsed.data.startsAt ?? current.startsAt;
  const endsAt = parsed.data.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) return res.status(400).json({ error: "End time must be after start time." });
  try {
    await assertLocation(current.venueId, nextFloor, nextSpace);
    const block = await prisma.venueAvailabilityBlock.update({ where: { id: req.params.id }, data: { ...parsed.data, startsAt, endsAt } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.availability.update", entityType: "VenueAvailabilityBlock", entityId: block.id, metadata: { venueId: block.venueId } });
    return res.json({ block });
  } catch (error) {
    const handled = sendLocationError(res, error); if (handled) return handled;
    throw error;
  }
});

router.delete("/availability/:id", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "availability");
  if (!row) return res.status(404).json({ error: "Availability block not found" });
  const block = await prisma.venueAvailabilityBlock.update({ where: { id: req.params.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.availability.archive", entityType: "VenueAvailabilityBlock", entityId: block.id, metadata: { venueId: block.venueId } });
  return res.status(204).send();
});

router.post("/availability/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "availability");
  if (!row) return res.status(404).json({ error: "Availability block not found" });
  const block = await prisma.venueAvailabilityBlock.update({ where: { id: req.params.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.availability.restore", entityType: "VenueAvailabilityBlock", entityId: block.id, metadata: { venueId: block.venueId } });
  return res.json({ block });
});

router.get("/maintenance/venues/:venueId", async (req, res) => {
  if (!(await canAccessVenue(req, req.params.venueId, "venue:view"))) return res.status(404).json({ error: "Venue not found" });
  const status = maintenanceStatus.safeParse(req.query.status);
  const where = {
    venueId: req.params.venueId,
    ...(status.success ? { status: status.data } : { status: { not: "archived" as const } }),
    ...(typeof req.query.from === "string" ? { endsAt: { gt: new Date(req.query.from) } } : {}),
    ...(typeof req.query.to === "string" ? { startsAt: { lt: new Date(req.query.to) } } : {}),
  };
  const blocks = await prisma.venueMaintenanceBlock.findMany({ where, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }] });
  return res.json({ blocks });
});

router.post("/maintenance/venues/:venueId", exhibitionMutationRateLimit, async (req, res) => {
  if (!(await canAccessVenue(req, req.params.venueId, "venue:manage"))) return res.status(404).json({ error: "Venue not found" });
  const parsed = maintenanceCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    await assertLocation(req.params.venueId, parsed.data.floorId, parsed.data.spaceId);
    const block = await prisma.venueMaintenanceBlock.create({ data: { venueId: req.params.venueId, ...parsed.data } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.maintenance.create", entityType: "VenueMaintenanceBlock", entityId: block.id, metadata: { venueId: block.venueId, startsAt: block.startsAt.toISOString(), endsAt: block.endsAt.toISOString() } });
    return res.status(201).json({ block });
  } catch (error) {
    const handled = sendLocationError(res, error); if (handled) return handled;
    throw error;
  }
});

router.get("/maintenance/:id", async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:view", "maintenance");
  if (!row) return res.status(404).json({ error: "Maintenance block not found" });
  return res.json({ block: await prisma.venueMaintenanceBlock.findUnique({ where: { id: req.params.id } }) });
});

router.patch("/maintenance/:id", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "maintenance");
  if (!row) return res.status(404).json({ error: "Maintenance block not found" });
  const parsed = maintenanceUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await prisma.venueMaintenanceBlock.findUniqueOrThrow({ where: { id: req.params.id } });
  const nextFloor = parsed.data.floorId !== undefined ? parsed.data.floorId : current.floorId;
  const nextSpace = parsed.data.spaceId !== undefined ? parsed.data.spaceId : current.spaceId;
  const startsAt = parsed.data.startsAt ?? current.startsAt;
  const endsAt = parsed.data.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) return res.status(400).json({ error: "End time must be after start time." });
  try {
    await assertLocation(current.venueId, nextFloor, nextSpace);
    const block = await prisma.venueMaintenanceBlock.update({ where: { id: req.params.id }, data: { ...parsed.data, startsAt, endsAt } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.maintenance.update", entityType: "VenueMaintenanceBlock", entityId: block.id, metadata: { venueId: block.venueId } });
    return res.json({ block });
  } catch (error) {
    const handled = sendLocationError(res, error); if (handled) return handled;
    throw error;
  }
});

router.delete("/maintenance/:id", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "maintenance");
  if (!row) return res.status(404).json({ error: "Maintenance block not found" });
  const block = await prisma.venueMaintenanceBlock.update({ where: { id: req.params.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.maintenance.archive", entityType: "VenueMaintenanceBlock", entityId: block.id, metadata: { venueId: block.venueId } });
  return res.status(204).send();
});

router.post("/maintenance/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const row = await canAccessBlock(req, req.params.id, "venue:manage", "maintenance");
  if (!row) return res.status(404).json({ error: "Maintenance block not found" });
  const block = await prisma.venueMaintenanceBlock.update({ where: { id: req.params.id }, data: { status: "scheduled", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.maintenance.restore", entityType: "VenueMaintenanceBlock", entityId: block.id, metadata: { venueId: block.venueId } });
  return res.json({ block });
});

export default router;
