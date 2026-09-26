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
const typeSchema = z.enum(["surface", "covered", "basement", "multilevel", "valet", "other"]);
const parkingSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(80).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  type: typeSchema.optional(),
  totalSpaces: z.number().int().min(1).max(1000000),
  accessibleSpaces: z.number().int().min(0).max(1000000).optional(),
  evChargingSpaces: z.number().int().min(0).max(1000000).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
const updateSchema = parkingSchema.partial().extend({ status: statusSchema.optional() });

function validateCounts(input: z.infer<typeof parkingSchema>) {
  const accessible = input.accessibleSpaces ?? 0;
  const ev = input.evChargingSpaces ?? 0;
  if (accessible > input.totalSpaces) return "Accessible parking spaces cannot exceed total spaces.";
  if (ev > input.totalSpaces) return "EV charging spaces cannot exceed total spaces.";
  return null;
}

async function accessibleVenue(user: import("@prisma/client").User, venueId: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.venue.findFirst({ where: { id: venueId, organizerId: { in: ids } } });
}

async function accessibleParking(user: import("@prisma/client").User, id: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.venueParkingArea.findFirst({ where: { id, venue: { organizerId: { in: ids } } } });
}

function conflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A parking area with the same name or code already exists for this venue." });
  }
  throw error;
}

router.get("/venues/:venueId/parking", async (req, res) => {
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:view");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success
    ? req.query.status as "active" | "inactive" | "archived" : undefined;
  const type = typeof req.query.type === "string" && typeSchema.safeParse(req.query.type).success
    ? req.query.type as z.infer<typeof typeSchema> : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const parkingAreas = await prisma.venueParkingArea.findMany({
    where: {
      venueId: venue.id,
      ...(status ? { status } : { status: { not: "archived" } }),
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return res.json({ parkingAreas });
});

router.get("/parking/:id", async (req, res) => {
  const parkingArea = await accessibleParking(req.user!, req.params.id, "venue:view");
  if (!parkingArea) return res.status(404).json({ error: "Parking area not found" });
  return res.json({ parkingArea });
});

router.post("/venues/:venueId/parking", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = parkingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const validationError = validateCounts(parsed.data);
  if (validationError) return res.status(400).json({ error: validationError });
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:manage");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.archivedAt) return res.status(409).json({ error: "Cannot add parking to an archived venue" });
  try {
    const parkingArea = await prisma.venueParkingArea.create({ data: { ...parsed.data, venueId: venue.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.parking.created", entityType: "VenueParkingArea", entityId: parkingArea.id, metadata: { venueId: venue.id } });
    return res.status(201).json({ parkingArea });
  } catch (error) { return conflict(res, error); }
});

router.patch("/parking/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await accessibleParking(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Parking area not found" });
  if (current.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This parking area is archived. Restore it before editing." });
  const merged = {
    totalSpaces: parsed.data.totalSpaces ?? current.totalSpaces,
    accessibleSpaces: parsed.data.accessibleSpaces ?? current.accessibleSpaces,
    evChargingSpaces: parsed.data.evChargingSpaces ?? current.evChargingSpaces,
  };
  const validationError = validateCounts(merged as z.infer<typeof parkingSchema>);
  if (validationError) return res.status(400).json({ error: validationError });
  try {
    const parkingArea = await prisma.venueParkingArea.update({
      where: { id: current.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived" ? (current.archivedAt ?? new Date()) : parsed.data.status ? null : undefined,
      },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.parking.updated", entityType: "VenueParkingArea", entityId: parkingArea.id, metadata: { venueId: parkingArea.venueId, changedFields: Object.keys(parsed.data) } });
    return res.json({ parkingArea });
  } catch (error) { return conflict(res, error); }
});

router.delete("/parking/:id", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleParking(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Parking area not found" });
  if (current.archivedAt) return res.status(204).send();
  await prisma.venueParkingArea.update({ where: { id: current.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.parking.archived", entityType: "VenueParkingArea", entityId: current.id, metadata: { venueId: current.venueId } });
  return res.status(204).send();
});

router.post("/parking/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleParking(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Parking area not found" });
  if (!current.archivedAt) return res.status(400).json({ error: "Parking area is not archived" });
  const venue = await accessibleVenue(req.user!, current.venueId, "venue:manage");
  if (!venue || venue.archivedAt) return res.status(409).json({ error: "Cannot restore parking under an archived venue" });
  const parkingArea = await prisma.venueParkingArea.update({ where: { id: current.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.parking.restored", entityType: "VenueParkingArea", entityId: parkingArea.id, metadata: { venueId: parkingArea.venueId } });
  return res.json({ parkingArea });
});

export default router;
