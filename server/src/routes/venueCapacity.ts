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
const capacitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  maxOccupancy: z.number().int().min(1).max(1000000),
  seatedCapacity: z.number().int().min(0).max(1000000).nullable().optional(),
  standingCapacity: z.number().int().min(0).max(1000000).nullable().optional(),
  wheelchairCapacity: z.number().int().min(0).max(1000000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
const updateSchema = capacitySchema.partial().extend({ status: statusSchema.optional() });

function validateCapacity(input: z.infer<typeof capacitySchema>) {
  const seated = input.seatedCapacity ?? 0;
  const standing = input.standingCapacity ?? 0;
  const wheelchair = input.wheelchairCapacity ?? 0;
  if (seated + standing > input.maxOccupancy) return "Seated and standing capacity cannot exceed maximum occupancy.";
  if (wheelchair > seated) return "Wheelchair capacity cannot exceed seated capacity.";
  return null;
}

function sendConflict(res: import("express").Response, error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return res.status(409).json({ error: "A capacity rule with the same name already exists for this space." });
  }
  throw error;
}

async function accessibleSpace(user: import("@prisma/client").User, spaceId: string, permission: "venue:view" | "venue:manage") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (!organizerIds.length) return null;
  return prisma.venueSpace.findFirst({
    where: { id: spaceId, zone: { floor: { building: { venue: { organizerId: { in: organizerIds } } } } } },
  });
}

async function accessibleRule(user: import("@prisma/client").User, ruleId: string, permission: "venue:view" | "venue:manage") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (!organizerIds.length) return null;
  return prisma.venueCapacityRule.findFirst({
    where: { id: ruleId, space: { zone: { floor: { building: { venue: { organizerId: { in: organizerIds } } } } } } },
  });
}

router.get("/spaces/:spaceId/rules", async (req, res) => {
  const space = await accessibleSpace(req.user!, req.params.spaceId, "venue:view");
  if (!space) return res.status(404).json({ error: "Space not found" });
  const status = typeof req.query.status === "string" && statusSchema.safeParse(req.query.status).success
    ? req.query.status as "active" | "inactive" | "archived" : undefined;
  const rules = await prisma.venueCapacityRule.findMany({
    where: { spaceId: space.id, ...(status ? { status } : { status: { not: "archived" } }) },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return res.json({ rules });
});

router.post("/spaces/:spaceId/rules", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = capacitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const validationError = validateCapacity(parsed.data);
  if (validationError) return res.status(400).json({ error: validationError });

  const space = await accessibleSpace(req.user!, req.params.spaceId, "venue:manage");
  if (!space) return res.status(404).json({ error: "Space not found" });
  if (space.archivedAt) return res.status(409).json({ error: "Cannot add capacity to an archived space" });

  try {
    const rule = await prisma.venueCapacityRule.create({ data: { ...parsed.data, spaceId: space.id } });
    await logAudit({ actorUserId: req.user!.id, action: "venue.capacity.created", entityType: "VenueCapacityRule", entityId: rule.id, metadata: { spaceId: space.id } });
    return res.status(201).json({ rule });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.patch("/rules/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const current = await accessibleRule(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Capacity rule not found" });
  if (current.archivedAt && parsed.data.status !== "archived") return res.status(409).json({ error: "This capacity rule is archived. Restore it before editing." });

  const merged = {
    name: parsed.data.name ?? current.name,
    maxOccupancy: parsed.data.maxOccupancy ?? current.maxOccupancy,
    seatedCapacity: parsed.data.seatedCapacity !== undefined ? parsed.data.seatedCapacity : current.seatedCapacity,
    standingCapacity: parsed.data.standingCapacity !== undefined ? parsed.data.standingCapacity : current.standingCapacity,
    wheelchairCapacity: parsed.data.wheelchairCapacity !== undefined ? parsed.data.wheelchairCapacity : current.wheelchairCapacity,
    notes: parsed.data.notes !== undefined ? parsed.data.notes : current.notes,
  };
  const validationError = validateCapacity(merged);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const rule = await prisma.venueCapacityRule.update({
      where: { id: current.id },
      data: {
        ...parsed.data,
        archivedAt: parsed.data.status === "archived" ? (current.archivedAt ?? new Date()) : parsed.data.status ? null : undefined,
      },
    });
    await logAudit({ actorUserId: req.user!.id, action: "venue.capacity.updated", entityType: "VenueCapacityRule", entityId: rule.id, metadata: { spaceId: rule.spaceId, changedFields: Object.keys(parsed.data) } });
    return res.json({ rule });
  } catch (error) {
    return sendConflict(res, error);
  }
});

router.delete("/rules/:id", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleRule(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Capacity rule not found" });
  if (current.archivedAt) return res.status(204).send();
  await prisma.venueCapacityRule.update({ where: { id: current.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.capacity.archived", entityType: "VenueCapacityRule", entityId: current.id, metadata: { spaceId: current.spaceId } });
  return res.status(204).send();
});

router.post("/rules/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const current = await accessibleRule(req.user!, req.params.id, "venue:manage");
  if (!current) return res.status(404).json({ error: "Capacity rule not found" });
  if (!current.archivedAt) return res.status(400).json({ error: "Capacity rule is not archived" });
  const rule = await prisma.venueCapacityRule.update({ where: { id: current.id }, data: { status: "active", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "venue.capacity.restored", entityType: "VenueCapacityRule", entityId: rule.id, metadata: { spaceId: rule.spaceId } });
  return res.json({ rule });
});

export default router;
