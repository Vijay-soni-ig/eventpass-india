import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, reply } from "../lib/lockedEventRoute";
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

const DUPLICATE = "This venue location is already allocated to the Event";

async function eventVenueId(tx: Prisma.TransactionClient, eventId: string) {
  const row = await tx.event.findUnique({ where: { id: eventId }, select: { venueId: true } });
  return row?.venueId ?? null;
}

async function resolveScope(tx: Prisma.TransactionClient, input: z.infer<typeof scopeSchema>, venueId: string) {
  const ids = [input.buildingId, input.floorId, input.zoneId, input.spaceId].filter(Boolean).length;
  const expected = input.scopeType === "venue" ? 0 : 1;
  if (ids !== expected) return { error: "scopeType " + input.scopeType + " requires exactly " + expected + " location reference(s)" };
  if (input.scopeType === "venue") return { data: { buildingId: null, floorId: null, zoneId: null, spaceId: null } };
  if (input.scopeType === "building") {
    const building = input.buildingId ? await tx.venueBuilding.findFirst({ where: { id: input.buildingId, venueId, status: { not: "archived" } }, select: { id: true } }) : null;
    return building ? { data: { buildingId: building.id, floorId: null, zoneId: null, spaceId: null } } : { error: "Building does not belong to this venue" };
  }
  if (input.scopeType === "floor") {
    const floor = input.floorId ? await tx.venueFloor.findFirst({ where: { id: input.floorId, status: { not: "archived" }, building: { venueId, status: { not: "archived" } } }, select: { id: true } }) : null;
    return floor ? { data: { buildingId: null, floorId: floor.id, zoneId: null, spaceId: null } } : { error: "Floor does not belong to this venue" };
  }
  if (input.scopeType === "zone") {
    const zone = input.zoneId ? await tx.venueZone.findFirst({ where: { id: input.zoneId, status: { not: "archived" }, floor: { status: { not: "archived" }, building: { venueId, status: { not: "archived" } } } }, select: { id: true } }) : null;
    return zone ? { data: { buildingId: null, floorId: null, zoneId: zone.id, spaceId: null } } : { error: "Zone does not belong to this venue" };
  }
  const space = input.spaceId ? await tx.venueSpace.findFirst({ where: { id: input.spaceId, status: { not: "archived" }, zone: { status: { not: "archived" }, floor: { status: { not: "archived" }, building: { venueId, status: { not: "archived" } } } } }, select: { id: true } }) : null;
  return space ? { data: { buildingId: null, floorId: null, zoneId: null, spaceId: space.id } } : { error: "Space does not belong to this venue" };
}

function targetWhere(scopeType: string, target: { buildingId: string | null; floorId: string | null; zoneId: string | null; spaceId: string | null }) {
  if (scopeType === "venue") return { scopeType: "venue" as const };
  if (scopeType === "building") return { scopeType: "building" as const, buildingId: target.buildingId };
  if (scopeType === "floor") return { scopeType: "floor" as const, floorId: target.floorId };
  if (scopeType === "zone") return { scopeType: "zone" as const, zoneId: target.zoneId };
  return { scopeType: "space" as const, spaceId: target.spaceId };
}

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts). The per-Event advisory lock
// that guards the duplicate-location check is taken after it, so lock order is
// always organizer row -> advisory lock.

router.get("/:eventId/venue-allocations", lockedEventRoute("event:view", async ({ tx, event }) => {
  const allocations = await tx.eventVenueAllocation.findMany({ where: { eventId: event.id, status: { not: "archived" } }, orderBy: { createdAt: "asc" } });
  return reply(200, { allocations });
}));

router.post("/:eventId/venue-allocations", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  const venueId = await eventVenueId(tx, event.id);
  if (!venueId) return reply(409, { error: "Assign a physical Venue to the Event before creating venue allocations" });
  const parsed = scopeSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const scope = await resolveScope(tx, parsed.data, venueId);
  if ("error" in scope) return reply(400, { error: scope.error });
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "event-venue-allocation:" + event.id);
  const duplicate = await tx.eventVenueAllocation.findFirst({ where: { eventId: event.id, status: { not: "archived" }, ...targetWhere(parsed.data.scopeType, scope.data) } });
  if (duplicate) return reply(409, { error: DUPLICATE });
  const allocation = await tx.eventVenueAllocation.create({ data: { eventId: event.id, venueId, scopeType: parsed.data.scopeType, label: parsed.data.label ?? null, ...scope.data } });
  return reply(201, { allocation }, () => logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.created", entityType: "EventVenueAllocation", entityId: allocation.id, metadata: { eventId: event.id, venueId, scopeType: allocation.scopeType } }));
}));

router.patch("/:eventId/venue-allocations/:allocationId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  const venueId = await eventVenueId(tx, event.id);
  if (!venueId) return reply(409, { error: "Event has no physical Venue" });
  const existing = await tx.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id, status: { not: "archived" } } });
  if (!existing) return reply(404, { error: "Venue allocation not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const nextScopeType = parsed.data.scopeType ?? existing.scopeType;
  const nextInput = { scopeType: nextScopeType, buildingId: parsed.data.buildingId ?? existing.buildingId, floorId: parsed.data.floorId ?? existing.floorId, zoneId: parsed.data.zoneId ?? existing.zoneId, spaceId: parsed.data.spaceId ?? existing.spaceId, label: parsed.data.label ?? existing.label };
  const scope = await resolveScope(tx, nextInput, venueId);
  if ("error" in scope) return reply(400, { error: scope.error });
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "event-venue-allocation:" + event.id);
  const duplicate = await tx.eventVenueAllocation.findFirst({ where: { eventId: event.id, id: { not: existing.id }, status: { not: "archived" }, ...targetWhere(nextScopeType, scope.data) } });
  if (duplicate) return reply(409, { error: DUPLICATE });
  const updated = await tx.eventVenueAllocation.update({ where: { id: existing.id }, data: { scopeType: nextScopeType, label: nextInput.label ?? null, ...scope.data, ...(parsed.data.status ? { status: parsed.data.status, archivedAt: parsed.data.status === "archived" ? new Date() : null } : {}) } });
  return reply(200, { allocation: updated }, () => logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.updated", entityType: "EventVenueAllocation", entityId: updated.id, metadata: { eventId: event.id, changedFields: Object.keys(req.body ?? {}) } }));
}));

router.delete("/:eventId/venue-allocations/:allocationId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  const existing = await tx.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id, status: { not: "archived" } } });
  if (!existing) return reply(404, { error: "Venue allocation not found" });
  const allocation = await tx.eventVenueAllocation.update({ where: { id: existing.id }, data: { status: "archived", archivedAt: new Date() } });
  return reply(204, undefined, () => logAudit({ actorUserId: req.user!.id, action: "event.venueAllocation.archived", entityType: "EventVenueAllocation", entityId: allocation.id, metadata: { eventId: event.id } }));
}));

router.post("/:eventId/venue-allocations/:allocationId/restore", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  // Serialize restore with create and PATCH for this Event so concurrent requests
  // cannot reactivate the same location twice.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "event-venue-allocation:" + event.id);
  const existing = await tx.eventVenueAllocation.findFirst({ where: { id: req.params.allocationId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Venue allocation not found" });

  const duplicate = await tx.eventVenueAllocation.findFirst({
    where: { eventId: event.id, id: { not: existing.id }, status: { not: "archived" }, ...targetWhere(existing.scopeType, existing) },
    select: { id: true },
  });
  if (duplicate) return reply(409, { error: DUPLICATE });

  const allocation = await tx.eventVenueAllocation.update({ where: { id: existing.id }, data: { status: "active", archivedAt: null } });
  return reply(200, { allocation }, () => logAudit({
    actorUserId: req.user!.id,
    action: "event.venueAllocation.restored",
    entityType: "EventVenueAllocation",
    entityId: allocation.id,
    metadata: { eventId: event.id, venueId: allocation.venueId, scopeType: allocation.scopeType },
  }));
}));

export default router;
