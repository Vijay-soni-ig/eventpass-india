import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { exhibitionMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const statusSchema = z.enum(["active", "inactive", "archived"]);
const typeSchema = z.enum([
  "restroom", "accessible_restroom", "first_aid", "medical_room", "information_desk",
  "cloakroom", "food_beverage", "atm", "wifi", "charging_station", "prayer_room",
  "security", "lost_found", "baby_care", "drinking_water", "elevator", "escalator", "other",
]);

const facilitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(80).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  type: typeSchema.optional(),
  floorId: z.string().uuid().nullable().optional(),
  spaceId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(1000000).optional(),
  isAccessible: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
const updateSchema = facilitySchema.partial().extend({ status: statusSchema.optional() });

async function accessibleVenue(user: import("@prisma/client").User, venueId: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.venue.findFirst({ where: { id: venueId, organizerId: { in: ids } } });
}

async function accessibleFacility(user: import("@prisma/client").User, id: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.venueFacility.findFirst({ where: { id, venue: { organizerId: { in: ids } } } });
}

function conflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A facility with the same name or code already exists for this venue." });
  }
  throw error;
}

async function validateLocation(venueId: string, floorId?: string | null, spaceId?: string | null) {
  let floor: { id: string; archivedAt: Date | null; building: { venueId: string; archivedAt: Date | null } } | null = null;
  if (floorId) {
    floor = await prisma.venueFloor.findFirst({
      where: { id: floorId, building: { venueId } },
      select: { id: true, archivedAt: true, building: { select: { venueId: true, archivedAt: true } } },
    });
    if (!floor) return "Floor does not belong to this venue.";
    if (floor.archivedAt || floor.building.archivedAt) return "Cannot place a facility on an archived floor or building.";
  }

  if (spaceId) {
    const space = await prisma.venueSpace.findFirst({
      where: { id: spaceId, zone: { floor: { building: { venueId } } } },
      select: { id: true, archivedAt: true, zone: { select: { floorId: true, archivedAt: true, floor: { select: { archivedAt: true, building: { select: { archivedAt: true } } } } } } },
    });
    if (!space) return "Space does not belong to this venue.";
    if (space.archivedAt || space.zone.archivedAt || space.zone.floor.archivedAt || space.zone.floor.building.archivedAt) {
      return "Cannot place a facility on an archived space, zone, floor, or building.";
    }
    if (floorId && space.zone.floorId !== floorId) return "Space must belong to the selected floor.";
  }

  return null;
}

router.get("/venues/:venueId/facilities", async (req, res) => {
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:view");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success ? req.query.status as "active" | "inactive" | "archived" : undefined;
  const type = typeof req.query.type === "string" && typeSchema.safeParse(req.query.type).success ? req.query.type as z.infer<typeof typeSchema> : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const facilities = await prisma.venueFacility.findMany({
    where: {
      venueId: venue.id,
      ...(status ? { status } : { status: { not: "archived" } }),
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return res.json({ facilities });
});

router.get("/facilities/:id", async (req, res) => {
  const facility = await accessibleFacility(req.user!, req.params.id, "venue:view");
  if (!facility) return res.status(404).json({ error: "Facility not found" });
  return res.json({ facility });
});

router.post("/venues/:venueId/facilities", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = facilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:manage");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.archivedAt) return res.status(409).json({ error: "Cannot add a facility to an archived venue" });

  const locationError = await validateLocation(venue.id, parsed.data.floorId, parsed.data.spaceId);
  if (locationError) return res.status(400).json({ error: locationError });

  try {
    const facility = await prisma.venueFacility.create({ data: { ...parsed.data, venueId: venue.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.facility.created", entityType: "VenueFacility", entityId: facility.id, metadata: { venueId: venue.id } });
    return res.status(201).json({ facility });
  } catch (error) { return conflict(res, error); }
});

router.patch("/facilities/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await accessibleFacility(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Facility not found" });
  if (current.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This facility is archived. Restore it before editing." });

  if (parsed.data.floorId !== undefined || parsed.data.spaceId !== undefined) {
    const locationError = await validateLocation(current.venueId, parsed.data.floorId ?? current.floorId, parsed.data.spaceId ?? current.spaceId);
    if (locationError) return res.status(400).json({ error: locationError });
  }

  try {
    const facility = await prisma.venueFacility.update({
      where: { id: current.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived" ? (current.archivedAt ?? new Date()) : parsed.data.status ? null : undefined,
      },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.facility.updated", entityType: "VenueFacility", entityId: facility.id, metadata: { venueId: facility.venueId, changedFields: Object.keys(parsed.data) } });
    return res.json({ facility });
  } catch (error) { return conflict(res, error); }
});

router.delete("/facilities/:id", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleFacility(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Facility not found" });
  if (current.archivedAt) return res.status(204).send();
  await prisma.venueFacility.update({ where: { id: current.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.facility.archived", entityType: "VenueFacility", entityId: current.id, metadata: { venueId: current.venueId } });
  return res.status(204).send();
});

router.post("/facilities/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleFacility(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Facility not found" });
  if (!current.archivedAt) return res.status(400).json({ error: "Facility is not archived" });
  const venue = await accessibleVenue(req.user!, current.venueId, "venue:manage");
  if (!venue || venue.archivedAt) return res.status(409).json({ error: "Cannot restore facility under an archived venue" });
  const locationError = await validateLocation(current.venueId, current.floorId, current.spaceId);
  if (locationError) return res.status(409).json({ error: locationError });
  const facility = await prisma.venueFacility.update({ where: { id: current.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.facility.restored", entityType: "VenueFacility", entityId: facility.id, metadata: { venueId: facility.venueId } });
  return res.json({ facility });
});

export default router;
