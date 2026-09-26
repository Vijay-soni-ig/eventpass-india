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

const venueCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().min(1).max(120).default("India"),
  postalCode: z.string().trim().max(30).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

const venueUpdateSchema = venueCreateSchema.partial().extend({ status: statusSchema.optional() });

const buildingCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

const buildingUpdateSchema = buildingCreateSchema.partial().extend({ status: statusSchema.optional() });

const floorCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).optional(),
  level: z.number().int().min(-100).max(1000),
  description: z.string().trim().max(5000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

const floorUpdateSchema = floorCreateSchema.partial().extend({ status: statusSchema.optional() });

function sendConflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A venue, building, or floor with the same scoped name/code/level already exists." });
  }
  throw error;
}

function pagination(req: import("express").Request) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:view");
  if (organizerIds.length === 0) return res.json({ venues: [], total: 0, page: 1, pageSize: 25 });

  const { page, pageSize, skip } = pagination(req);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success
    ? req.query.status as "active" | "inactive" | "archived"
    : undefined;

  const where = {
    organizerId: { in: organizerIds },
    ...(status ? { status } : { status: { not: "archived" as const } }),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
        { city: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [venues, total] = await Promise.all([
    prisma.venue.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { buildings: true } } },
    }),
    prisma.venue.count({ where }),
  ]);

  res.json({ venues, total, page, pageSize });
});

router.post("/", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = venueCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage venues" });
  const organizerId = organizerIds[0];

  try {
    const venue = await prisma.venue.create({ data: { ...parsed.data, organizerId } });
    await logAudit({
      actorUserId: req.user!.id,
      action: "venue.created",
      entityType: "Venue",
      entityId: venue.id,
      metadata: { organizerId, name: venue.name },
    });
    return res.status(201).json({ venue });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.get("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:view");
  const venue = organizerIds.length
    ? await prisma.venue.findFirst({
        where: { id: req.params.id, organizerId: { in: organizerIds } },
        include: {
          buildings: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { floors: { orderBy: [{ sortOrder: "asc" }, { level: "asc" }], include: { zones: { where: { status: { not: "archived" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
          },
        },
      })
    : null;

  if (!venue) return res.status(404).json({ error: "Venue not found" });
  res.json({ venue });
});

router.patch("/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = venueUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const existing = organizerIds.length
    ? await prisma.venue.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Venue not found" });
  if (existing.archivedAt && parsed.data.status !== "archived") {
    return res.status(409).json({ error: "This venue is archived. Restore it before editing." });
  }

  try {
    const venue = await prisma.venue.update({
      where: { id: existing.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived" ? (existing.archivedAt ?? new Date()) : parsed.data.status ? null : undefined,
      },
    });
    await logAudit({
      actorUserId: req.user!.id,
      action: "venue.updated",
      entityType: "Venue",
      entityId: venue.id,
      metadata: { changedFields: Object.keys(parsed.data) },
    });
    return res.json({ venue });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.delete("/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const existing = organizerIds.length
    ? await prisma.venue.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Venue not found" });
  if (existing.archivedAt) return res.status(204).send();

  await prisma.venue.update({ where: { id: existing.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.archived", entityType: "Venue", entityId: existing.id, metadata: {} });
  res.status(204).send();
});

router.post("/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const existing = organizerIds.length
    ? await prisma.venue.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Venue not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "Venue is not archived" });

  const venue = await prisma.venue.update({ where: { id: existing.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.restored", entityType: "Venue", entityId: venue.id, metadata: {} });
  res.json({ venue });
});

router.get("/:venueId/buildings", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:view");
  const venue = organizerIds.length ? await prisma.venue.findFirst({ where: { id: req.params.venueId, organizerId: { in: organizerIds } }, select: { id: true } }) : null;
  if (!venue) return res.status(404).json({ error: "Venue not found" });

  const buildings = await prisma.venueBuilding.findMany({
    where: { venueId: venue.id, status: { not: "archived" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { floors: true } } },
  });
  res.json({ buildings });
});

router.post("/:venueId/buildings", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = buildingCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const venue = organizerIds.length ? await prisma.venue.findFirst({ where: { id: req.params.venueId, organizerId: { in: organizerIds } } }) : null;
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.archivedAt) return res.status(409).json({ error: "Cannot add a building to an archived venue" });

  try {
    const building = await prisma.venueBuilding.create({ data: { ...parsed.data, venueId: venue.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.building.created", entityType: "VenueBuilding", entityId: building.id, metadata: { venueId: venue.id } });
    return res.status(201).json({ building });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.patch("/buildings/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = buildingUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const building = organizerIds.length
    ? await prisma.venueBuilding.findFirst({ where: { id: req.params.id, venue: { organizerId: { in: organizerIds } } } })
    : null;
  if (!building) return res.status(404).json({ error: "Building not found" });
  if (building.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This building is archived. Restore the venue before editing." });

  try {
    const updated = await prisma.venueBuilding.update({
      where: { id: building.id },
      data: { ...parsed.data, archivedAt: parsed.data.status === "archived" ? (building.archivedAt ?? new Date()) : parsed.data.status ? null : undefined },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.building.updated", entityType: "VenueBuilding", entityId: updated.id, metadata: { venueId: updated.venueId, changedFields: Object.keys(parsed.data) } });
    return res.json({ building: updated });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.delete("/buildings/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const building = organizerIds.length ? await prisma.venueBuilding.findFirst({ where: { id: req.params.id, venue: { organizerId: { in: organizerIds } } } }) : null;
  if (!building) return res.status(404).json({ error: "Building not found" });
  if (building.archivedAt) return res.status(204).send();
  await prisma.venueBuilding.update({ where: { id: building.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.building.archived", entityType: "VenueBuilding", entityId: building.id, metadata: { venueId: building.venueId } });
  res.status(204).send();
});

router.post("/buildings/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const building = organizerIds.length ? await prisma.venueBuilding.findFirst({ where: { id: req.params.id, venue: { organizerId: { in: organizerIds } } } }) : null;
  if (!building) return res.status(404).json({ error: "Building not found" });
  if (!building.archivedAt) return res.status(400).json({ error: "Building is not archived" });
  const updated = await prisma.venueBuilding.update({ where: { id: building.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.building.restored", entityType: "VenueBuilding", entityId: building.id, metadata: { venueId: building.venueId } });
  res.json({ building: updated });
});

router.get("/buildings/:buildingId/floors", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:view");
  const building = organizerIds.length ? await prisma.venueBuilding.findFirst({ where: { id: req.params.buildingId, venue: { organizerId: { in: organizerIds } } }, select: { id: true } }) : null;
  if (!building) return res.status(404).json({ error: "Building not found" });

  const floors = await prisma.venueFloor.findMany({
    where: { buildingId: building.id, status: { not: "archived" } },
    orderBy: [{ sortOrder: "asc" }, { level: "asc" }],
  });
  res.json({ floors });
});

router.post("/buildings/:buildingId/floors", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = floorCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const building = organizerIds.length
    ? await prisma.venueBuilding.findFirst({ where: { id: req.params.buildingId, venue: { organizerId: { in: organizerIds } } } })
    : null;
  if (!building) return res.status(404).json({ error: "Building not found" });
  if (building.archivedAt) return res.status(409).json({ error: "Cannot add a floor to an archived building" });

  try {
    const floor = await prisma.venueFloor.create({ data: { ...parsed.data, buildingId: building.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.floor.created", entityType: "VenueFloor", entityId: floor.id, metadata: { buildingId: building.id, venueId: building.venueId } });
    return res.status(201).json({ floor });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.patch("/floors/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = floorUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const floor = organizerIds.length
    ? await prisma.venueFloor.findFirst({ where: { id: req.params.id, building: { venue: { organizerId: { in: organizerIds } } } } })
    : null;
  if (!floor) return res.status(404).json({ error: "Floor not found" });
  if (floor.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This floor is archived. Restore it before editing." });

  try {
    const updated = await prisma.venueFloor.update({
      where: { id: floor.id },
      data: { ...parsed.data, archivedAt: parsed.data.status === "archived" ? (floor.archivedAt ?? new Date()) : parsed.data.status ? null : undefined },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.floor.updated", entityType: "VenueFloor", entityId: updated.id, metadata: { buildingId: updated.buildingId, changedFields: Object.keys(parsed.data) } });
    return res.json({ floor: updated });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.delete("/floors/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const floor = organizerIds.length ? await prisma.venueFloor.findFirst({ where: { id: req.params.id, building: { venue: { organizerId: { in: organizerIds } } } } }) : null;
  if (!floor) return res.status(404).json({ error: "Floor not found" });
  if (floor.archivedAt) return res.status(204).send();
  await prisma.venueFloor.update({ where: { id: floor.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.floor.archived", entityType: "VenueFloor", entityId: floor.id, metadata: { buildingId: floor.buildingId } });
  res.status(204).send();
});

router.post("/floors/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "venue:manage");
  const floor = organizerIds.length ? await prisma.venueFloor.findFirst({ where: { id: req.params.id, building: { venue: { organizerId: { in: organizerIds } } } } }) : null;
  if (!floor) return res.status(404).json({ error: "Floor not found" });
  if (!floor.archivedAt) return res.status(400).json({ error: "Floor is not archived" });
  const updated = await prisma.venueFloor.update({ where: { id: floor.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.floor.restored", entityType: "VenueFloor", entityId: floor.id, metadata: { buildingId: updated.buildingId } });
  res.json({ floor: updated });
});

export default router;
