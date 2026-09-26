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
const typeSchema = z.enum(["main", "secondary", "emergency", "service", "staff", "other"]);
const entranceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(80).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  type: typeSchema.optional(),
  floorId: z.string().uuid().nullable().optional(),
  isAccessible: z.boolean().optional(),
  isEmergencyExit: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
const updateSchema = entranceSchema.partial().extend({ status: statusSchema.optional() });

async function organizerIds(user: import("@prisma/client").User, permission: "venue:view" | "venue:manage") {
  return organizerIdsWithPermission(user, permission);
}

async function accessibleVenue(user: import("@prisma/client").User, venueId: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIds(user, permission);
  if (!ids.length) return null;
  return prisma.venue.findFirst({ where: { id: venueId, organizerId: { in: ids } } });
}

async function accessibleEntrance(user: import("@prisma/client").User, id: string, permission: "venue:view" | "venue:manage") {
  const ids = await organizerIds(user, permission);
  if (!ids.length) return null;
  return prisma.venueEntrance.findFirst({ where: { id, venue: { organizerId: { in: ids } } } });
}

async function validFloorForVenue(floorId: string | null | undefined, venueId: string) {
  if (!floorId) return true;
  return Boolean(await prisma.venueFloor.findFirst({ where: { id: floorId, building: { venueId } } }));
}

function conflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "An entrance with the same name or code already exists for this venue." });
  }
  throw error;
}

router.get("/venues/:venueId/entrances", async (req, res) => {
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:view");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success
    ? req.query.status as "active" | "inactive" | "archived" : undefined;
  const type = typeof req.query.type === "string" && typeSchema.safeParse(req.query.type).success
    ? req.query.type as z.infer<typeof typeSchema> : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const entrances = await prisma.venueEntrance.findMany({
    where: {
      venueId: venue.id,
      ...(status ? { status } : { status: { not: "archived" } }),
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { floor: { select: { id: true, name: true, level: true } } },
  });
  return res.json({ entrances });
});

router.get("/entrances/:id", async (req, res) => {
  const entrance = await accessibleEntrance(req.user!, req.params.id, "venue:view");
  if (!entrance) return res.status(404).json({ error: "Entrance not found" });
  return res.json({ entrance });
});

router.post("/venues/:venueId/entrances", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = entranceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const venue = await accessibleVenue(req.user!, req.params.venueId, "venue:manage");
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.archivedAt) return res.status(409).json({ error: "Cannot add an entrance to an archived venue" });
  if (!(await validFloorForVenue(parsed.data.floorId, venue.id))) return res.status(400).json({ error: "Floor does not belong to this venue" });
  if (parsed.data.isEmergencyExit && parsed.data.type === "service") return res.status(400).json({ error: "Emergency exits cannot use service entrance type" });
  try {
    const entrance = await prisma.venueEntrance.create({ data: { ...parsed.data, venueId: venue.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.entrance.created", entityType: "VenueEntrance", entityId: entrance.id, metadata: { venueId: venue.id } });
    return res.status(201).json({ entrance });
  } catch (error) { return conflict(res, error); }
});

router.patch("/entrances/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await accessibleEntrance(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Entrance not found" });
  if (current.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This entrance is archived. Restore it before editing." });
  if (!(await validFloorForVenue(parsed.data.floorId !== undefined ? parsed.data.floorId : current.floorId, current.venueId))) return res.status(400).json({ error: "Floor does not belong to this venue" });
  const emergency = parsed.data.isEmergencyExit !== undefined ? parsed.data.isEmergencyExit : current.isEmergencyExit;
  const type = parsed.data.type !== undefined ? parsed.data.type : current.type;
  if (emergency && type === "service") return res.status(400).json({ error: "Emergency exits cannot use service entrance type" });
  try {
    const entrance = await prisma.venueEntrance.update({
      where: { id: current.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived" ? (current.archivedAt ?? new Date()) : parsed.data.status ? null : undefined,
      },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.entrance.updated", entityType: "VenueEntrance", entityId: entrance.id, metadata: { venueId: entrance.venueId, changedFields: Object.keys(parsed.data) } });
    return res.json({ entrance });
  } catch (error) { return conflict(res, error); }
});

router.delete("/entrances/:id", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleEntrance(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Entrance not found" });
  if (current.archivedAt) return res.status(204).send();
  await prisma.venueEntrance.update({ where: { id: current.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.entrance.archived", entityType: "VenueEntrance", entityId: current.id, metadata: { venueId: current.venueId } });
  return res.status(204).send();
});

router.post("/entrances/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleEntrance(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Entrance not found" });
  if (!current.archivedAt) return res.status(400).json({ error: "Entrance is not archived" });
  const venue = await accessibleVenue(req.user!, current.venueId, "venue:manage");
  if (!venue || venue.archivedAt) return res.status(409).json({ error: "Cannot restore an entrance under an archived venue" });
  const entrance = await prisma.venueEntrance.update({ where: { id: current.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.entrance.restored", entityType: "VenueEntrance", entityId: entrance.id, metadata: { venueId: entrance.venueId } });
  return res.json({ entrance });
});

export default router;
