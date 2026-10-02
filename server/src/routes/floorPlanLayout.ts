import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { publishFloorPlan } from "../lib/floorPlanPublish";
import {
  lockOrganizerForEntitlement,
  assertCanCreateStall,
  EntitlementError,
  sendEntitlementError,
  logEntitlementBlocked,
} from "../lib/entitlementService";
import { floorPlanMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

// Exhibition, stall, and floor-plan IDs are stored as Prisma String IDs.
// Production-created records normally use UUIDs, but development/test seed data
// intentionally uses deterministic IDs (for example `seed-exhibition-1`).
// Authorization and tenant ownership checks below remain the security boundary,
// so the route validates a bounded non-empty identifier instead of requiring
// UUID format.
const idSchema = z.string().trim().min(1).max(128);
const numberSchema = z.number().finite();
const versionSchema = z.number().int().positive();
// Floor-plan backgrounds can come from the configured public object-storage
// URL (absolute) or the local upload route (relative /uploads/... URL). Both
// are valid asset references and are resolved to the browser origin by the
// frontend. Reject arbitrary schemes/paths while allowing the storage formats
// that this API itself produces.
const backgroundUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      if (value.startsWith("/uploads/")) {
        return /^\/uploads\/(floor-plans|exhibition-covers)\/[a-f0-9-]+\.(jpg|png|webp)$/.test(value);
      }
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Invalid background URL" }
  );

const planCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  canvasWidth: numberSchema.positive().max(100000),
  canvasHeight: numberSchema.positive().max(100000),
  backgroundUrl: backgroundUrlSchema.nullable().optional(),
});
const planUpdateSchema = z.object({
  expectedVersion: versionSchema,
  name: z.string().trim().min(1).max(120).optional(),
  canvasWidth: numberSchema.positive().max(100000).optional(),
  canvasHeight: numberSchema.positive().max(100000).optional(),
  backgroundUrl: backgroundUrlSchema.nullable().optional(),
});
const objectSchema = z.object({
  expectedVersion: versionSchema,
  stallId: idSchema,
  x: numberSchema.min(0).max(100000),
  y: numberSchema.min(0).max(100000),
  width: numberSchema.positive().max(100000),
  height: numberSchema.positive().max(100000),
  rotation: numberSchema.min(-360).max(360).default(0),
  zIndex: z.number().int().min(-100000).max(100000).default(0),
  labelVisible: z.boolean().default(true),
});
const objectUpdateSchema = objectSchema.partial().extend({
  expectedVersion: versionSchema,
});
const objectBulkUpdateSchema = z.object({
  expectedVersion: versionSchema,
  updates: z
    .array(
      z.object({
        objectId: idSchema,
        x: numberSchema.min(0).max(100000).optional(),
        y: numberSchema.min(0).max(100000).optional(),
        width: numberSchema.positive().max(100000).optional(),
        height: numberSchema.positive().max(100000).optional(),
        rotation: numberSchema.min(-360).max(360).optional(),
        zIndex: z.number().int().min(-100000).max(100000).optional(),
      })
    )
    .min(1, "Select at least one stall")
    .max(500, "Too many stalls in one request"),
});
const objectBulkDeleteSchema = z.object({
  expectedVersion: versionSchema,
  objectIds: z.array(idSchema).min(1, "Select at least one stall").max(500, "Too many stalls in one request"),
});
const generateStallsSchema = z
  .object({
    expectedVersion: versionSchema,
    prefix: z.string().trim().max(10).default(""),
    startNumber: z.number().int().min(0).max(99999).default(1),
    padding: z.number().int().min(0).max(5).default(2),
    count: z.number().int().min(1, "Enter how many stalls to create").max(200, "Create at most 200 stalls at a time"),
    stallType: z.enum(["premium", "standard", "basic"]).default("standard"),
    size: z.string().trim().max(40).optional(),
    price: z.number().finite().nonnegative().max(100000000),
    x: numberSchema.min(0).max(100000),
    y: numberSchema.min(0).max(100000),
    width: numberSchema.positive().max(100000),
    height: numberSchema.positive().max(100000),
    columns: z.number().int().min(1).max(200),
    gap: numberSchema.min(0).max(10000).default(10),
  });
const objectBulkSchema = z.object({
  expectedVersion: versionSchema,
  objects: z.array(objectSchema.omit({ expectedVersion: true })).min(1, "Select at least one stall").max(500, "Too many stalls in one request"),
});

type Permission = "exhibition:view" | "exhibition:update" | "stall:manage";

function parseId(value: string): string | null {
  const result = idSchema.safeParse(value);
  return result.success ? result.data : null;
}

async function loadExhibition(exhibitionId: string, user: Express.Request["user"], permission: Permission) {
  const organizerIds = await organizerIdsWithPermission(user!, permission);
  if (organizerIds.length === 0) return null;
  return prisma.exhibition.findFirst({
    where: { id: exhibitionId, organizerId: { in: organizerIds } },
    select: { id: true, organizerId: true },
  });
}

function assertBounds(x: number, y: number, width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > canvasWidth || y + height > canvasHeight) {
    throw Object.assign(new Error("Floor plan object must remain within canvas bounds"), { status: 400 });
  }
}

router.get("/:exhibitionId/floor-plan-layouts", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:view"))) return res.status(404).json({ error: "Exhibition not found" });

  const floorPlans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} ORDER BY "updatedAt" DESC
  `);
  return res.json({ floorPlans });
});

router.get("/:exhibitionId/floor-plan-layouts/:floorPlanId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:view"))) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (plans.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  const objects = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "createdAt", "updatedAt"
    FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} ORDER BY "zIndex" ASC, "createdAt" ASC
  `);
  return res.json({ floorPlan: plans[0], objects });
});

router.post("/:exhibitionId/floor-plan-layouts", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  const parsed = planCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const id = crypto.randomUUID();
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} AND name = ${parsed.data.name} LIMIT 1
  `);
  if (existing.length) return res.status(409).json({ error: "A floor plan with this name already exists for the exhibition" });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "floor_plans" (id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "updatedAt")
    VALUES (${id}, ${exhibitionId}, ${parsed.data.name}, 'draft', 1, ${parsed.data.backgroundUrl ?? null}, ${parsed.data.canvasWidth}, ${parsed.data.canvasHeight}, CURRENT_TIMESTAMP)
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.created", entityType: "FloorPlan", entityId: id, metadata: { exhibitionId, name: parsed.data.name } });
  return res.status(201).json({ floorPlan: { id, exhibitionId, ...parsed.data, status: "draft", version: 1 } });
});

router.patch("/:exhibitionId/floor-plan-layouts/:floorPlanId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = planUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const current = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
    SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (current.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (current[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });
  if (current[0].version !== parsed.data.expectedVersion) {
    return res.status(409).json({ error: "Floor plan changed since you loaded it. Refresh and try again.", code: "FLOOR_PLAN_VERSION_CONFLICT", currentVersion: current[0].version });
  }

  const canvasWidth = parsed.data.canvasWidth ?? Number(current[0].canvasWidth);
  const canvasHeight = parsed.data.canvasHeight ?? Number(current[0].canvasHeight);
  const objects = await prisma.$queryRaw<Array<{ x: number; y: number; width: number; height: number }>>(Prisma.sql`
    SELECT x, y, width, height FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
  `);
  try {
    objects.forEach((object) => assertBounds(Number(object.x), Number(object.y), Number(object.width), Number(object.height), canvasWidth, canvasHeight));
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : "Canvas size would invalidate objects" });
  }

  const assignments = [
    parsed.data.name !== undefined ? Prisma.sql`name = ${parsed.data.name}` : null,
    parsed.data.canvasWidth !== undefined ? Prisma.sql`"canvasWidth" = ${parsed.data.canvasWidth}` : null,
    parsed.data.canvasHeight !== undefined ? Prisma.sql`"canvasHeight" = ${parsed.data.canvasHeight}` : null,
    parsed.data.backgroundUrl !== undefined ? Prisma.sql`"backgroundUrl" = ${parsed.data.backgroundUrl}` : null,
  ].filter((value): value is Prisma.Sql => value !== null);
  if (assignments.length === 0) return res.json({ ok: true, version: current[0].version });
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "floor_plans" SET ${Prisma.join(assignments, ", ")}, version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${parsed.data.expectedVersion}
  `);
  if (updated === 0) {
    return res.status(409).json({ error: "Floor plan changed since you loaded it. Refresh and try again.", code: "FLOOR_PLAN_VERSION_CONFLICT" });
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.updated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, expectedVersion: parsed.data.expectedVersion, newVersion: parsed.data.expectedVersion + 1 } });
  return res.json({ ok: true, version: parsed.data.expectedVersion + 1 });
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const id = crypto.randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
        SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plans[0].version !== parsed.data.expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      assertBounds(parsed.data.x, parsed.data.y, parsed.data.width, parsed.data.height, Number(plans[0].canvasWidth), Number(plans[0].canvasHeight));

      const stall = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "stalls" WHERE id = ${parsed.data.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
      `);
      if (stall.length === 0) throw Object.assign(new Error("Stall does not belong to this exhibition"), { status: 400 });
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" = ${parsed.data.stallId} LIMIT 1
      `);
      if (duplicate.length) throw Object.assign(new Error("Stall is already mapped on this floor plan"), { status: 409 });

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
        VALUES (${id}, ${floorPlanId}, ${parsed.data.stallId}, ${parsed.data.x}, ${parsed.data.y}, ${parsed.data.width}, ${parsed.data.height}, ${parsed.data.rotation}, ${parsed.data.zIndex}, ${parsed.data.labelVisible}, CURRENT_TIMESTAMP)
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${parsed.data.expectedVersion}
      `);
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to add floor plan object", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_created", entityType: "FloorPlanObject", entityId: id, metadata: { exhibitionId, floorPlanId, stallId: parsed.data.stallId, expectedVersion: parsed.data.expectedVersion, newVersion: parsed.data.expectedVersion + 1 } });
  return res.status(201).json({ object: { id, floorPlanId, ...parsed.data }, version: parsed.data.expectedVersion + 1 });
});

// Places many stalls in one atomic step ("Place all unmapped"). One request and
// one version bump, instead of N single-object calls that would each need the
// previous call's version and quickly exhaust the mutation rate limit.
router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/bulk", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectBulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan objects" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion, objects } = parsed.data;
  const stallIds = objects.map((object) => object.stallId);
  if (new Set(stallIds).size !== stallIds.length) return res.status(400).json({ error: "A stall can only be mapped once" });

  try {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
        SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plans[0].version !== expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      objects.forEach((object) => assertBounds(object.x, object.y, object.width, object.height, Number(plans[0].canvasWidth), Number(plans[0].canvasHeight)));

      const stalls = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "stalls" WHERE "exhibitionId" = ${exhibitionId} AND id IN (${Prisma.join(stallIds)})
      `);
      if (stalls.length !== stallIds.length) throw Object.assign(new Error("Stall does not belong to this exhibition"), { status: 400 });
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" IN (${Prisma.join(stallIds)}) LIMIT 1
      `);
      if (duplicate.length) throw Object.assign(new Error("Stall is already mapped on this floor plan"), { status: 409 });

      const rows = objects.map((object) => Prisma.sql`(${crypto.randomUUID()}, ${floorPlanId}, ${object.stallId}, ${object.x}, ${object.y}, ${object.width}, ${object.height}, ${object.rotation}, ${object.zIndex}, ${object.labelVisible}, CURRENT_TIMESTAMP)`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
        VALUES ${Prisma.join(rows, ", ")}
      `);
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${expectedVersion}
      `);
      if (updated === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to add floor plan objects", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.objects_bulk_created", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: objects.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.status(201).json({ created: objects.length, version: expectedVersion + 1 });
});

// Moves/aligns/resizes several stalls at once (multi-select). One request, one
// version bump; every object is validated before any is written.
router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/bulk-update", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectBulkUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan objects" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion, updates } = parsed.data;
  const ids = updates.map((update) => update.objectId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "An object can only be updated once per request" });

  try {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
        SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plans[0].version !== expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });

      const current = await tx.$queryRaw<Array<{ id: string; x: number; y: number; width: number; height: number }>>(Prisma.sql`
        SELECT id, x, y, width, height FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND id IN (${Prisma.join(ids)})
      `);
      if (current.length !== ids.length) throw Object.assign(new Error("Floor plan object not found"), { status: 404 });
      const byId = new Map(current.map((row) => [row.id, row]));

      for (const update of updates) {
        const row = byId.get(update.objectId)!;
        assertBounds(update.x ?? Number(row.x), update.y ?? Number(row.y), update.width ?? Number(row.width), update.height ?? Number(row.height), Number(plans[0].canvasWidth), Number(plans[0].canvasHeight));
        const assignments = [
          update.x !== undefined ? Prisma.sql`x = ${update.x}` : null,
          update.y !== undefined ? Prisma.sql`y = ${update.y}` : null,
          update.width !== undefined ? Prisma.sql`width = ${update.width}` : null,
          update.height !== undefined ? Prisma.sql`height = ${update.height}` : null,
          update.rotation !== undefined ? Prisma.sql`rotation = ${update.rotation}` : null,
          update.zIndex !== undefined ? Prisma.sql`"zIndex" = ${update.zIndex}` : null,
        ].filter((value): value is Prisma.Sql => value !== null);
        if (assignments.length === 0) continue;
        await tx.$executeRaw(Prisma.sql`
          UPDATE "floor_plan_objects" SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${update.objectId} AND "floorPlanId" = ${floorPlanId}
        `);
      }
      const bumped = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${expectedVersion}
      `);
      if (bumped === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to update floor plan objects", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.objects_bulk_updated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: updates.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.json({ ok: true, updated: updates.length, version: expectedVersion + 1 });
});

// Removes several stalls from the plan at once. The stalls themselves are untouched.
router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/bulk-delete", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectBulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan objects" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion } = parsed.data;
  const ids = Array.from(new Set(parsed.data.objectIds));
  try {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ status: string; version: number }>>(Prisma.sql`
        SELECT status, version FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plans[0].version !== expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      const deleted = await tx.$executeRaw(Prisma.sql`
        DELETE FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND id IN (${Prisma.join(ids)})
      `);
      if (deleted !== ids.length) throw Object.assign(new Error("Floor plan object not found"), { status: 404 });
      const bumped = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${expectedVersion}
      `);
      if (bumped === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to remove floor plan objects", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.objects_bulk_deleted", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: ids.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.json({ ok: true, deleted: ids.length, version: expectedVersion + 1 });
});

router.patch("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const context = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
    SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (context.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (context[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });
  if (context[0].version !== parsed.data.expectedVersion) {
    return res.status(409).json({ error: "Floor plan changed since you loaded it. Refresh and try again.", code: "FLOOR_PLAN_VERSION_CONFLICT", currentVersion: context[0].version });
  }
  const current = await prisma.$queryRaw<Array<{ stallId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; labelVisible: boolean }>>(Prisma.sql`
    SELECT "stallId", x, y, width, height, rotation, "zIndex", "labelVisible" FROM "floor_plan_objects" WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId} LIMIT 1
  `);
  if (current.length === 0) return res.status(404).json({ error: "Floor plan object not found" });
  const value = { ...current[0], ...parsed.data };
  const stall = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "stalls" WHERE id = ${value.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1`);
  if (stall.length === 0) return res.status(400).json({ error: "Stall does not belong to this exhibition" });
  try { assertBounds(Number(value.x), Number(value.y), Number(value.width), Number(value.height), Number(context[0].canvasWidth), Number(context[0].canvasHeight)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid object bounds" }); }
  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" = ${value.stallId} AND id <> ${objectId} LIMIT 1
  `);
  if (duplicate.length) return res.status(409).json({ error: "Stall is already mapped on this floor plan" });

  const assignments = [
    parsed.data.stallId !== undefined ? Prisma.sql`"stallId" = ${parsed.data.stallId}` : null,
    parsed.data.x !== undefined ? Prisma.sql`x = ${parsed.data.x}` : null,
    parsed.data.y !== undefined ? Prisma.sql`y = ${parsed.data.y}` : null,
    parsed.data.width !== undefined ? Prisma.sql`width = ${parsed.data.width}` : null,
    parsed.data.height !== undefined ? Prisma.sql`height = ${parsed.data.height}` : null,
    parsed.data.rotation !== undefined ? Prisma.sql`rotation = ${parsed.data.rotation}` : null,
    parsed.data.zIndex !== undefined ? Prisma.sql`"zIndex" = ${parsed.data.zIndex}` : null,
    parsed.data.labelVisible !== undefined ? Prisma.sql`"labelVisible" = ${parsed.data.labelVisible}` : null,
  ].filter((value): value is Prisma.Sql => value !== null);
  if (assignments.length === 0) return res.json({ ok: true, version: context[0].version });
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plan_objects" SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
      `);
      if (result === 0) throw Object.assign(new Error("Floor plan object not found"), { status: 404 });
      const planUpdated = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${parsed.data.expectedVersion}
      `);
      if (planUpdated === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) {
      return res.status(status).json({
        error: error instanceof Error ? error.message : "Unable to update floor plan object",
        code: "code" in (error as object) ? (error as { code?: string }).code : undefined,
      });
    }
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_updated", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId, stallId: value.stallId, expectedVersion: parsed.data.expectedVersion, newVersion: parsed.data.expectedVersion + 1 } });
  return res.json({ ok: true, version: parsed.data.expectedVersion + 1 });
});

router.delete("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });
  const expectedVersionResult = z.coerce.number().int().positive().safeParse(req.query.version);
  if (!expectedVersionResult.success) return res.status(400).json({ error: "A valid floor plan version is required to delete an object" });
  const expectedVersion = expectedVersionResult.data;
  let result: number;
  try {
    result = await prisma.$transaction(async (tx) => {
      const plan = await tx.$queryRaw<Array<{ status: string; version: number }>>(Prisma.sql`
        SELECT status, version FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plan.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plan[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plan[0].version !== expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      const deleted = await tx.$executeRaw(Prisma.sql`
        DELETE FROM "floor_plan_objects" WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
      `);
      if (deleted === 0) throw Object.assign(new Error("Floor plan object not found"), { status: 404 });
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${expectedVersion}
      `);
      if (updated === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      return expectedVersion + 1;
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) {
      return res.status(status).json({
        error: error instanceof Error ? error.message : "Unable to delete floor plan object",
        code: "code" in (error as object) ? (error as { code?: string }).code : undefined,
      });
    }
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_deleted", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId, expectedVersion, newVersion: result } });
  return res.status(204).send();
});

class DuplicateGeneratedStallCodeError extends Error {}

// Creates a block of new stalls AND places them on the draft plan in one atomic
// step ("Generate stalls"). Stalls remain the commercial source of truth, so this
// goes through the same entitlement limit and duplicate-code rules as
// POST /exhibitions/:id/stalls, and needs both permissions.
router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/generate-stalls", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = generateStallsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid stall block" });
  const exhibition = await loadExhibition(exhibitionId, req.user, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  if (!(await loadExhibition(exhibitionId, req.user, "stall:manage"))) return res.status(403).json({ error: "You do not have permission to create stalls" });

  const input = parsed.data;
  const codes = Array.from({ length: input.count }, (_, i) => `${input.prefix}${String(input.startNumber + i).padStart(input.padding, "0")}`);
  const stallIds = codes.map(() => crypto.randomUUID());
  const positions = codes.map((_, i) => ({
    x: input.x + (i % input.columns) * (input.width + input.gap),
    y: input.y + Math.floor(i / input.columns) * (input.height + input.gap),
  }));

  try {
    await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, exhibition.organizerId);
      const plans = await tx.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
        SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
      if (plans[0].version !== input.expectedVersion) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
      positions.forEach((p) => assertBounds(p.x, p.y, input.width, input.height, Number(plans[0].canvasWidth), Number(plans[0].canvasHeight)));

      const existing = await tx.stall.findMany({ where: { exhibitionId }, select: { code: true } });
      const taken = new Set(existing.map((s) => s.code?.trim().toLowerCase()).filter((c): c is string => !!c));
      const clash = codes.find((c) => taken.has(c.toLowerCase()));
      if (clash) throw new DuplicateGeneratedStallCodeError(`Another stall in this exhibition already uses the code "${clash}".`);

      await assertCanCreateStall(tx, exhibition.organizerId, input.count);
      await tx.stall.createMany({
        data: codes.map((code, i) => ({
          id: stallIds[i],
          exhibitionId,
          code,
          stallType: input.stallType,
          size: input.size,
          price: input.price,
        })),
      });
      const rows = codes.map((_, i) => Prisma.sql`(${crypto.randomUUID()}, ${floorPlanId}, ${stallIds[i]}, ${positions[i].x}, ${positions[i].y}, ${input.width}, ${input.height}, 0, 0, true, CURRENT_TIMESTAMP)`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
        VALUES ${Prisma.join(rows, ", ")}
      `);
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${input.expectedVersion}
      `);
      if (updated === 0) throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    });
  } catch (error) {
    if (error instanceof DuplicateGeneratedStallCodeError) return res.status(409).json({ error: error.message, code: "STALL_CODE_DUPLICATE" });
    if (error instanceof EntitlementError) {
      await logEntitlementBlocked(exhibition.organizerId, req.user!.id, error);
      return sendEntitlementError(res, error);
    }
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to generate stalls", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.stalls_generated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, organizerId: exhibition.organizerId, count: input.count, firstCode: codes[0], lastCode: codes[codes.length - 1], price: String(input.price), expectedVersion: input.expectedVersion, newVersion: input.expectedVersion + 1 } });
  return res.status(201).json({ created: input.count, version: input.expectedVersion + 1, stallIds });
});

// Published and archived plans are immutable, so "edit a published plan" means
// copying it (background, canvas and every placed stall) into a fresh draft.
// Publishing that draft later archives the plan it was copied from.
router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/clone", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const newId = crypto.randomUUID();
  let draftName = "";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${`floor-plan-clone:${exhibitionId}`}, 0))
      `);
      const sources = await tx.$queryRaw<Array<{ name: string; status: string; backgroundUrl: string | null; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
        SELECT name, status, "backgroundUrl", "canvasWidth", "canvasHeight" FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (sources.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      const source = sources[0];
      if (source.status === "draft") throw Object.assign(new Error("This floor plan is already a draft"), { status: 409 });

      const drafts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} AND status = 'draft' LIMIT 1
      `);
      if (drafts.length) throw Object.assign(new Error("A draft floor plan already exists. Continue editing it instead."), { status: 409, code: "FLOOR_PLAN_DRAFT_EXISTS" });

      const names = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId}
      `);
      const taken = new Set(names.map((row) => row.name));
      const base = source.name.replace(/ \(draft(?: \d+)?\)$/, "").slice(0, 100);
      draftName = `${base} (draft)`;
      for (let n = 2; taken.has(draftName); n += 1) draftName = `${base} (draft ${n})`;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plans" (id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "updatedAt")
        VALUES (${newId}, ${exhibitionId}, ${draftName}, 'draft', 1, ${source.backgroundUrl}, ${source.canvasWidth}, ${source.canvasHeight}, CURRENT_TIMESTAMP)
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
        SELECT gen_random_uuid()::text, ${newId}, "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", CURRENT_TIMESTAMP
        FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
      `);
    });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    if (status < 500) return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to create a draft", code: "code" in (error as object) ? (error as { code?: string }).code : undefined });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.cloned", entityType: "FloorPlan", entityId: newId, metadata: { exhibitionId, sourceFloorPlanId: floorPlanId, name: draftName } });
  return res.status(201).json({ floorPlan: { id: newId, exhibitionId, name: draftName, status: "draft", version: 1 } });
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/publish",floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });
  const parsed = z.object({ expectedVersion: versionSchema }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "A valid floor plan version is required to publish" });

  try {
    await publishFloorPlan(exhibitionId, floorPlanId, parsed.data.expectedVersion);
  } catch (error) {
    // The unique index (floor_plans_one_published_per_exhibition_idx) is a
    // last-resort database-level backstop for any path that isn't covered by
    // the advisory lock above; kept as a second, independent guard.
    const isPublishConflict = error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2010"
      && String(error.meta?.message ?? "").includes("floor_plans_one_published_per_exhibition_idx");
    const status = isPublishConflict
      ? 409
      : typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    if (status < 500) {
      return res.status(status).json({
        error: isPublishConflict
          ? "Another floor plan was published concurrently. Please refresh and try again."
          : error instanceof Error ? error.message : "Unable to publish floor plan",
      });
    }
    throw error;
  }

  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.published", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId } });
  return res.json({ ok: true, status: "published" });
});

export default router;
