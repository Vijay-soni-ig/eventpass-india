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
  "room", "meeting_room", "conference_room", "auditorium",
  "hall", "office", "storage", "service_room", "other",
]);

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  type: typeSchema.default("room"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
const updateSchema = createSchema.partial().extend({ status: statusSchema.optional() });

function sendConflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A space with the same name or code already exists in this zone." });
  }
  throw error;
}

async function accessibleZone(
  user: import("@prisma/client").User,
  zoneId: string,
  permission: "venue:view" | "venue:manage",
) {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (!organizerIds.length) return null;
  return prisma.venueZone.findFirst({
    where: { id: zoneId, floor: { building: { venue: { organizerId: { in: organizerIds } } } } },
  });
}

async function accessibleSpace(
  user: import("@prisma/client").User,
  spaceId: string,
  permission: "venue:view" | "venue:manage",
) {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (!organizerIds.length) return null;
  return prisma.venueSpace.findFirst({
    where: { id: spaceId, zone: { floor: { building: { venue: { organizerId: { in: organizerIds } } } } } },
  });
}

router.get("/zones/:zoneId/spaces", async (req, res) => {
  const zone = await accessibleZone(req.user!, req.params.zoneId, "venue:view");
  if (!zone) return res.status(404).json({ error: "Zone not found" });

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" && ["active", "inactive", "archived"].includes(req.query.status)
    ? req.query.status as "active" | "inactive" | "archived"
    : undefined;

  const spaces = await prisma.venueSpace.findMany({
    where: {
      zoneId: zone.id,
      ...(status ? { status } : { status: { not: "archived" } }),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return res.json({ spaces });
});

router.get("/spaces/:id", async (req, res) => {
  const space = await accessibleSpace(req.user!, req.params.id, "venue:view");
  if (!space) return res.status(404).json({ error: "Space not found" });
  return res.json({ space });
});

router.post("/zones/:zoneId/spaces", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const zone = await accessibleZone(req.user!, req.params.zoneId, "venue:manage");
  if (!zone) return res.status(404).json({ error: "Zone not found" });
  if (zone.archivedAt) return res.status(409).json({ error: "Cannot add a space to an archived zone" });

  try {
    const space = await prisma.venueSpace.create({ data: { ...parsed.data, zoneId: zone.id } });
    await logAudit({
      actorUserId: req.user!.id,
      action: "venue.space.created",
      entityType: "VenueSpace",
      entityId: space.id,
      metadata: { zoneId: zone.id },
    });
    return res.status(201).json({ space });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.patch("/spaces/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const space = await accessibleSpace(req.user!, req.params.id, "venue:manage");
  if (!space) return res.status(404).json({ error: "Space not found" });
  if (space.archivedAt && parsed.data.status !== "archived") {
    return res.status(409).json({ error: "This space is archived. Restore it before editing." });
  }

  try {
    const updated = await prisma.venueSpace.update({
      where: { id: space.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived"
          ? (space.archivedAt ?? new Date())
          : parsed.data.status
            ? null
            : undefined,
      },
    });
    await logAudit({
      actorUserId: req.user!.id,
      action: "venue.space.updated",
      entityType: "VenueSpace",
      entityId: updated.id,
      metadata: { zoneId: updated.zoneId, changedFields: Object.keys(parsed.data) },
    });
    return res.json({ space: updated });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.delete("/spaces/:id", exhibitionMutationRateLimit, async (req, res) => {
  const space = await accessibleSpace(req.user!, req.params.id, "venue:manage");
  if (!space) return res.status(404).json({ error: "Space not found" });
  if (space.archivedAt) return res.status(204).send();

  await prisma.venueSpace.update({
    where: { id: space.id },
    data: { status: "archived", archivedAt: new Date() },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "venue.space.archived",
    entityType: "VenueSpace",
    entityId: space.id,
    metadata: { zoneId: space.zoneId },
  });
  return res.status(204).send();
});

router.post("/spaces/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const space = await accessibleSpace(req.user!, req.params.id, "venue:manage");
  if (!space) return res.status(404).json({ error: "Space not found" });
  if (!space.archivedAt) return res.status(400).json({ error: "Space is not archived" });

  const updated = await prisma.venueSpace.update({
    where: { id: space.id },
    data: { status: "active", archivedAt: null },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "venue.space.restored",
    entityType: "VenueSpace",
    entityId: updated.id,
    metadata: { zoneId: updated.zoneId },
  });
  return res.json({ space: updated });
});

export default router;
