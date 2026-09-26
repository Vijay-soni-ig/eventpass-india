import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const scopeSchema = z.object({
  scopeType: z.enum(["venue", "building", "floor", "zone", "space"]),
  buildingId: z.string().uuid().nullable().optional(),
  floorId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  spaceId: z.string().uuid().nullable().optional(),
  label: z.string().trim().max(160).nullable().optional(),
});
const updateSchema = scopeSchema.partial().extend({ status: z.enum(["active", "inactive", "archived"]).optional() });

async function authorizedEvent(eventId: string, user: Express.Request["user"], permission: "event:view" | "event:update") {
  if (!user) return null;
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (!organizerIds.length) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds }, archivedAt: null }, select: { id: true, venueId: true } });
}

async function resolveScope(input: z.infer<typeof scopeSchema>, venueId: string) {
  const ids = [input.buildingId, input.floorId, input.zoneId, input.spaceId].filter(Boolean).length;
  const expected = input.scopeType === "venue" ? 0 : 1;
  if (ids !== expected) return { error: "scopeType " + input.scopeType + " requires exactly " + expected + " location reference(s)" };
  if (input.scopeType === "venue") return { data: { buildingId: null, floorId: null, zoneId: null, spaceId: null } };
  if (input.scopeType === "building") {
    const building = input.buildingId ? await prisma.venueBuilding.findFirst({ where: { id: input.buildingId, venueId, status: { not: "archived" } }, select: { id: true } }) : null;
    return building ? { data: { buildingId: building.id, floorId: null, zoneId: null, spaceId: null } } : { error: "Building does not belong to this venue" };
  }
  if (input.scopeType === "floor") {
    const floor = input.floorId ? await prisma.venueFloor.findFirst({ where: { id: input.floorId, status: { not: "archived" }, building: { venueId, status: { not: "archived" } } }, select: { id: true } }) : null;
    return floor ? { data: { buildingId: null, floorId: floor.id, zoneId: null, spaceId: null } } : { error: "Floor does not belong to this venue" };
  }
  if (input.scopeType === "zone") {
    const zone = input.zoneId ? await prisma.venueZone.findFirst({ where: { id: input.zoneId, status: { not: "archived" }, floor: { status: { not: "archived" }, building: { venueId, status: { not: "archived" } } } }, select: { id: true } }) : null;
    return zone ? { data: { buildingId: null, floorId: null, zoneId: zone.id, spaceId: null } } : { error: "Zone does not belong to this venue" };
  }
  const space = input.spaceId ? await prisma.venueSpace.findFirst({ where: { id: input.spaceId, status: { not: "archived" }, zone: { status: { not: "archived" }, floor: { status: { not: "archived" }, building: { venueId, status: { not: "archived" } } } } }, select: { id: true } }) : null;
  return space ? { data: { buildingId: null, floorId: null, zoneId: null, spaceId: space.id } } : { error: "Space does not belong to this venue" };
}

function targetWhere(scopeType: string, target: { buildingId: string | null; floorId: string | null; zoneId: string | null; spaceId: string | null }) {
  if (scopeType === "venue") return { scopeType: "venue" as const };
  if (scopeType === "building") return { scopeType: "building" as const, buildingId: target.buildingId };
  if (scopeType === "floor") return { scopeType: "floor" as const, floorId: target.floorId };
  if (scopeType === "zone") return { scopeType: "zone" as const, zoneId: target.zoneId };
  return { scopeType: "space" as const, spaceId: target.spaceId };
}

router.get("/:eventId/venue-allocations", async (req, res) => {
  const event = await authorizedEvent(req.params.eventId, req.user, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const allocations = await prisma.eventVenueAllocation.findMany({ where: { eventId: event.id, status: { not: "archived" } }, orderBy: { createdAt: "asc" } });
  return res.json({ allocations });
});

router.post("/:eventId/venue-allocations", eventMutationRateLimit, async (req, res) => {
  const event = await authorizedEvent(req.params.eventId, req.user, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!event.venueId) return res.status(409).json({ error: "Assign a physical Venue to the Event before creating venue allocations" });
  const parsed = scopeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const scope = await resolveScope(parsed.data, event.venueId);
  if ("error" in scope) return res.status(400).json({ error: scope.error });
  const allocation = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "event-venue-allocation:" + event.id);
    const duplicate = await tx.eventVenueAllocation.findFirst({ where: { eventId: event.id, status: { not: "archived" }, ...targetWhere(parsed.data.scopeType, scope.data) } });
    if (duplicate) throw new Error("DUPLICATE_ALLOCATION");
    return tx.eventVenueAllocation.create({ data: { eventId: event.id, venueId: event.venueId!, scopeType: parsed.data.scopeType, label: parsed.data.label ?? null, ...scope.data } });
  }).catch((error: unknown) => error instanceof Error && error.message === "DUPLICATE_ALLOCATION" ? null : Promise.reject(error));
  if (!allocation) return res.status(409).json({ error: "This venue location is already allocated to the Event" });
  await logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.created", entityType: "EventVenueAllocation", entityId: allocation.id, metadata: { eventId: event.id, venueId: event.venueId, scopeType: allocation.scopeType } });
  return res.status(201).json({ allocation });
});

router.patch("/:eventId/venue-allocations/:allocationId", eventMutationRateLimit, async (req, res) => {
  const event = await authorizedEvent(req.params.eventId, req.user, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!event.venueId) return res.status(409).json({ error: "Event has no physical Venue" });
  const existing = await prisma.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id, status: { not: "archived" } } });
  if (!existing) return res.status(404).json({ error: "Venue allocation not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const nextScopeType = parsed.data.scopeType ?? existing.scopeType;
  const nextInput = { scopeType: nextScopeType, buildingId: parsed.data.buildingId ?? existing.buildingId, floorId: parsed.data.floorId ?? existing.floorId, zoneId: parsed.data.zoneId ?? existing.zoneId, spaceId: parsed.data.spaceId ?? existing.spaceId, label: parsed.data.label ?? existing.label };
  const scope = await resolveScope(nextInput, event.venueId);
  if ("error" in scope) return res.status(400).json({ error: scope.error });
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "event-venue-allocation:" + event.id);
    const duplicate = await tx.eventVenueAllocation.findFirst({ where: { eventId: event.id, id: { not: existing.id }, status: { not: "archived" }, ...targetWhere(nextScopeType, scope.data) } });
    if (duplicate) throw new Error("DUPLICATE_ALLOCATION");
    return tx.eventVenueAllocation.update({ where: { id: existing.id }, data: { scopeType: nextScopeType, label: nextInput.label ?? null, ...scope.data, ...(parsed.data.status ? { status: parsed.data.status, archivedAt: parsed.data.status === "archived" ? new Date() : null } : {}) } });
  }).catch((error: unknown) => error instanceof Error && error.message === "DUPLICATE_ALLOCATION" ? null : Promise.reject(error));
  if (!updated) return res.status(409).json({ error: "This venue location is already allocated to the Event" });
  await logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.updated", entityType: "EventVenueAllocation", entityId: updated.id, metadata: { eventId: event.id, changedFields: Object.keys(req.body ?? {}) } });
  return res.json({ allocation: updated });
});

router.delete("/:eventId/venue-allocations/:allocationId", eventMutationRateLimit, async (req, res) => {
  const event = await authorizedEvent(req.params.eventId, req.user, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const existing = await prisma.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id, status: { not: "archived" } } });
  if (!existing) return res.status(404).json({ error: "Venue allocation not found" });
  const allocation = await prisma.eventVenueAllocation.update({ where: { id: existing.id }, data: { status: "archived", archivedAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.archived", entityType: "EventVenueAllocation", entityId: allocation.id, metadata: { eventId: event.id } });
  return res.status(204).send();
});

router.post("/:eventId/venue-allocations/:allocationId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await authorizedEvent(req.params.eventId, req.user, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const existing = await prisma.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Venue allocation not found" });
  const allocation = await prisma.eventVenueAllocation.update({ where: { id: existing.id }, data: { status: "active", archivedAt: null } });
  return res.json({ allocation });
});

export default router;