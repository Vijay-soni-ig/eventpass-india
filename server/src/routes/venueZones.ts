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
  "public_area", "exhibition_area", "registration", "lobby",
  "meeting", "food_beverage", "service", "restricted", "other",
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  type: typeSchema.default("other"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
const updateSchema = createSchema.partial().extend({ status: statusSchema.optional() });

function conflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A zone with the same name or code already exists on this floor." });
  }
  throw error;
}

async function accessibleFloor(userId: string, floorId: string, permission: "venue:view" | "venue:manage") {
  const organizerIds = await organizerIdsWithPermission({ id: userId } as Parameters<typeof organizerIdsWithPermission>[0], permission);
  if (!organizerIds.length) return null;
  return prisma.venueFloor.findFirst({
    where: { id: floorId, building: { venue: { organizerId: { in: organizerIds } } } },
  });
}

router.get("/floors/:floorId/zones", async (req, res) => {
  const floor = await accessibleFloor(req.user!.id, req.params.floorId, "venue:view");
  if (!floor) return res.status(404).json({ error: "Floor not found" });
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success
    ? req.query.status as "active" | "inactive" | "archived" : undefined;
  const zones = await prisma.venueZone.findMany({
    where: {
      floorId: floor.id,
      ...(status ? { status } : { status: { not: "archived" as const } }),
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json({ zones });
});

router.post("/floors/:floorId/zones", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const floor = await accessibleFloor(req.user!.id, req.params.floorId, "venue:manage");
  if (!floor) return res.status(404).json({ error: "Floor not found" });
  if (floor.archivedAt) return res.status(409).json({ error: "Cannot add a zone to an archived floor" });
  try {
    const zone = await prisma.venueZone.create({ data: { ...parsed.data, floorId: floor.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.zone.created", entityType: "VenueZone", entityId: zone.id, metadata: { floorId: floor.id, buildingId: floor.buildingId } });
    return res.status(201).json({ zone });
  } catch (error) {
    return conflict(res, error);
  }
});

router.patch("/zones/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const zone = organizerIds.length ? await prisma.venueZone.findFirst({
    where: { id: req.params.id, floor: { building: { venue: { organizerId: { in: organizerIds } } } } },
  }) : null;
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  if (zone.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This zone is archived. Restore it before editing." });
  try {
    const updated = await prisma.venueZone.update({
      where: { id: zone.id },
      data: { ...parsed.data, archivedAt: parsed.data.status === "archived" ? (zone.archivedAt ?? new Date()) : parsed.data.status ? null : undefined },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.zone.updated", entityType: "VenueZone", entityId: updated.id, metadata: { floorId: updated.floorId, changedFields: Object.keys(parsed.data) } });
    return res.json({ zone: updated });
  } catch (error) {
    return conflict(res, error);
  }
});

router.delete("/zones/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const zone = organizerIds.length ? await prisma.venueZone.findFirst({
    where: { id: req.params.id, floor: { building: { venue: { organizerId: { in: organizerIds } } } } },
  }) : null;
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  if (zone.archivedAt) return res.status(204).send();
  await prisma.venueZone.update({ where: { id: zone.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.zone.archived", entityType: "VenueZone", entityId: zone.id, metadata: { floorId: zone.floorId } });
  res.status(204).send();
});

router.post("/zones/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const zone = organizerIds.length ? await prisma.venueZone.findFirst({
    where: { id: req.params.id, floor: { building: { venue: { organizerId: { in: organizerIds } } } } },
  }) : null;
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  if (!zone.archivedAt) return res.status(400).json({ error: "Zone is not archived" });
  const updated = await prisma.venueZone.update({ where: { id: zone.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.zone.restored", entityType: "VenueZone", entityId: zone.id, metadata: { floorId: zone.floorId } });
  res.json({ zone: updated });
});

export default router;
