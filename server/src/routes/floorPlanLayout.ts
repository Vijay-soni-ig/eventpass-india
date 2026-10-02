import { Router, type Response } from "express";
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
  // Omit for the exhibition's first hall (created on demand as "Main Hall").
  hallId: idSchema.optional(),
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
        labelVisible: z.boolean().optional(),
      })
    )
    .min(1, "Select at least one stall")
    .max(500, "Too many stalls in one request"),
});
const objectBulkDeleteSchema = z.object({
  expectedVersion: versionSchema,
  objectIds: z.array(idSchema).min(1, "Select at least one stall").max(500, "Too many stalls in one request"),
});
const elementTypeSchema = z.enum(["aisle", "entrance", "exit", "stage", "restroom", "food", "info", "pillar", "label"]);
const elementFieldsSchema = z.object({
  type: elementTypeSchema,
  label: z.string().max(80).nullable().optional(),
  x: numberSchema.min(0).max(100000),
  y: numberSchema.min(0).max(100000),
  width: numberSchema.positive().max(100000),
  height: numberSchema.positive().max(100000),
  rotation: numberSchema.min(-360).max(360).default(0),
  zIndex: z.number().int().min(-100000).max(100000).default(0),
});
const elementCreateSchema = z.object({
  expectedVersion: versionSchema,
  // `id` is optional so an undo can put a removed element back under its old id.
  elements: z
    .array(elementFieldsSchema.extend({ id: z.string().uuid().optional() }))
    .min(1, "Add at least one element")
    .max(200, "Too many elements in one request"),
});
const elementUpdateSchema = z.object({
  expectedVersion: versionSchema,
  updates: z
    .array(
      z.object({
        elementId: idSchema,
        type: elementTypeSchema.optional(),
        label: z.string().max(80).nullable().optional(),
        x: numberSchema.min(0).max(100000).optional(),
        y: numberSchema.min(0).max(100000).optional(),
        width: numberSchema.positive().max(100000).optional(),
        height: numberSchema.positive().max(100000).optional(),
        rotation: numberSchema.min(-360).max(360).optional(),
        zIndex: z.number().int().min(-100000).max(100000).optional(),
      })
    )
    .min(1, "Select at least one element")
    .max(200, "Too many elements in one request"),
});
const elementDeleteSchema = z.object({
  expectedVersion: versionSchema,
  elementIds: z.array(idSchema).min(1, "Select at least one element").max(200, "Too many elements in one request"),
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

// ---------------------------------------------------------------------------
// Halls. An exhibition can have several; each hall has its own floor plan
// lifecycle (one published plan, one draft). Old callers that never mention a
// hall keep working: they get the exhibition's first hall, created on demand.
// ---------------------------------------------------------------------------
const DEFAULT_HALL_NAME = "Main Hall";
const MAX_HALLS_PER_EXHIBITION = 20;
type Queryable = Prisma.TransactionClient | typeof prisma;

async function firstHallId(db: Queryable, exhibitionId: string): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "exhibition_halls" WHERE "exhibitionId" = ${exhibitionId}
    ORDER BY "sortOrder" ASC, "createdAt" ASC, id ASC LIMIT 1
  `);
  return rows[0]?.id ?? null;
}

async function resolveHallId(db: Queryable, exhibitionId: string, hallId?: string): Promise<string> {
  if (hallId) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "exhibition_halls" WHERE id = ${hallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
    `);
    if (rows.length === 0) throw Object.assign(new Error("Hall not found"), { status: 404 });
    return rows[0].id;
  }
  const existing = await firstHallId(db, exhibitionId);
  if (existing) return existing;
  // Two first requests can race; the unique (exhibitionId, name) makes the loser a no-op.
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "exhibition_halls" (id, "exhibitionId", name, "sortOrder", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${exhibitionId}, ${DEFAULT_HALL_NAME}, 0, CURRENT_TIMESTAMP)
    ON CONFLICT ("exhibitionId", name) DO NOTHING
  `);
  const created = await firstHallId(db, exhibitionId);
  if (!created) throw new Error("Unable to create the default hall");
  return created;
}

/**
 * A stall sits in at most one hall (in a draft or published plan), so its physical
 * location is never ambiguous. Serialised per exhibition so two halls cannot claim
 * the same stall at the same moment.
 */
async function assertPlacementAllowed(tx: Prisma.TransactionClient, exhibitionId: string, floorPlanId: string, stallIds: string[]) {
  if (stallIds.length === 0) return;
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`floor-plan-stalls:${exhibitionId}`}, 0))
  `);
  const rows = await tx.$queryRaw<Array<{ code: string | null; hall: string }>>(Prisma.sql`
    SELECT s.code, h.name AS hall
    FROM "floor_plan_objects" o
    JOIN "floor_plans" p ON p.id = o."floorPlanId"
    JOIN "exhibition_halls" h ON h.id = p."hallId"
    JOIN "stalls" s ON s.id = o."stallId"
    WHERE o."stallId" IN (${Prisma.join(stallIds)})
      AND p."hallId" <> (SELECT "hallId" FROM "floor_plans" WHERE id = ${floorPlanId})
      AND p.status IN ('draft', 'published')
    LIMIT 1
  `);
  if (rows.length > 0) {
    const stall = rows[0].code ? `Stall ${rows[0].code}` : "That stall";
    throw Object.assign(new Error(`${stall} is already placed in ${rows[0].hall}. Remove it from that hall's plan first.`), {
      status: 409,
      code: "STALL_IN_OTHER_HALL",
    });
  }
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

  // Optional ?hallId= narrows the list to one hall's plans.
  const hallQuery = typeof req.query.hallId === "string" ? parseId(req.query.hallId) : null;
  if (typeof req.query.hallId === "string" && !hallQuery) return res.status(400).json({ error: "Invalid hall id" });
  const hallFilter = hallQuery ? Prisma.sql`AND "hallId" = ${hallQuery}` : Prisma.empty;

  const floorPlans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", "hallId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} ${hallFilter} ORDER BY "updatedAt" DESC
  `);
  return res.json({ floorPlans });
});

router.get("/:exhibitionId/floor-plan-layouts/:floorPlanId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:view"))) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", "hallId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (plans.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  const objects = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "createdAt", "updatedAt"
    FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} ORDER BY "zIndex" ASC, "createdAt" ASC
  `);
  const elements = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "floorPlanId", type::text AS type, label, x, y, width, height, rotation, "zIndex", "createdAt", "updatedAt"
    FROM "floor_plan_elements" WHERE "floorPlanId" = ${floorPlanId} ORDER BY "zIndex" ASC, "createdAt" ASC, id ASC
  `);
  return res.json({ floorPlan: plans[0], objects, elements });
});

router.post("/:exhibitionId/floor-plan-layouts", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  const parsed = planCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const id = crypto.randomUUID();
  let hallId: string;
  try {
    hallId = await resolveHallId(prisma, exhibitionId, parsed.data.hallId);
  } catch (error) {
    return sendRouteError(res, error, "Unable to resolve the hall");
  }
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plans" WHERE "hallId" = ${hallId} AND name = ${parsed.data.name} LIMIT 1
  `);
  if (existing.length) return res.status(409).json({ error: "A floor plan with this name already exists in this hall" });

  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "floor_plans" (id, "exhibitionId", "hallId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "updatedAt")
      VALUES (${id}, ${exhibitionId}, ${hallId}, ${parsed.data.name}, 'draft', 1, ${parsed.data.backgroundUrl ?? null}, ${parsed.data.canvasWidth}, ${parsed.data.canvasHeight}, CURRENT_TIMESTAMP)
    `);
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: "A floor plan with this name already exists in this hall" });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.created", entityType: "FloorPlan", entityId: id, metadata: { exhibitionId, hallId, name: parsed.data.name } });
  return res.status(201).json({ floorPlan: { id, exhibitionId, ...parsed.data, hallId, status: "draft", version: 1 } });
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
    UNION ALL
    SELECT x, y, width, height FROM "floor_plan_elements" WHERE "floorPlanId" = ${floorPlanId}
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
      await assertPlacementAllowed(tx, exhibitionId, floorPlanId, [parsed.data.stallId]);

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
      await assertPlacementAllowed(tx, exhibitionId, floorPlanId, stallIds);

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
          update.labelVisible !== undefined ? Prisma.sql`"labelVisible" = ${update.labelVisible}` : null,
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
      if (parsed.data.stallId !== undefined && parsed.data.stallId !== current[0].stallId) {
        await assertPlacementAllowed(tx, exhibitionId, floorPlanId, [parsed.data.stallId]);
      }
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

// ---------------------------------------------------------------------------
// Plan elements (aisles, entrances, stages, labels...). Presentation only; they
// share the plan's draft/publish lifecycle and optimistic version with stalls.
// ---------------------------------------------------------------------------

type DraftPlanContext = { canvasWidth: number; canvasHeight: number };

/**
 * Runs `work` inside a transaction that has locked the plan row, confirmed it is
 * still a draft at `expectedVersion`, and bumps the version once if `work` succeeds.
 */
async function mutateDraftPlan<T>(
  exhibitionId: string,
  floorPlanId: string,
  expectedVersion: number,
  work: (tx: Prisma.TransactionClient, plan: DraftPlanContext) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const plans = await tx.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number; version: number }>>(Prisma.sql`
      SELECT status, "canvasWidth", "canvasHeight", version FROM "floor_plans"
      WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
    `);
    if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
    if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be edited"), { status: 409 });
    if (plans[0].version !== expectedVersion) {
      throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    }
    const result = await work(tx, { canvasWidth: Number(plans[0].canvasWidth), canvasHeight: Number(plans[0].canvasHeight) });
    const bumped = await tx.$executeRaw(Prisma.sql`
      UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft' AND version = ${expectedVersion}
    `);
    if (bumped === 0) {
      throw Object.assign(new Error("Floor plan changed since you loaded it. Refresh and try again."), { status: 409, code: "FLOOR_PLAN_VERSION_CONFLICT" });
    }
    return result;
  });
}

function sendRouteError(res: Response, error: unknown, fallback: string): Response {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  if (status >= 500) throw error;
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
  return res.status(status).json({ error: error instanceof Error ? error.message : fallback, code });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || (error.code === "P2010" && String(error.meta?.code ?? "") === "23505"));
}

function requireLabelText(type: string, label: string | null | undefined) {
  if (type === "label" && !(label ?? "").trim()) {
    throw Object.assign(new Error("A text label needs some text"), { status: 400 });
  }
}

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/elements/bulk", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = elementCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid elements" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion, elements } = parsed.data;
  const items = elements.map((element) => ({ ...element, id: element.id ?? crypto.randomUUID(), label: element.label?.trim() || null }));
  if (new Set(items.map((item) => item.id)).size !== items.length) return res.status(400).json({ error: "Duplicate element id" });

  try {
    await mutateDraftPlan(exhibitionId, floorPlanId, expectedVersion, async (tx, plan) => {
      for (const item of items) {
        requireLabelText(item.type, item.label);
        assertBounds(item.x, item.y, item.width, item.height, plan.canvasWidth, plan.canvasHeight);
      }
      const rows = items.map(
        (item) => Prisma.sql`(${item.id}, ${floorPlanId}, ${item.type}::"FloorPlanElementType", ${item.label}, ${item.x}, ${item.y}, ${item.width}, ${item.height}, ${item.rotation}, ${item.zIndex}, CURRENT_TIMESTAMP)`
      );
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_elements" (id, "floorPlanId", type, label, x, y, width, height, rotation, "zIndex", "updatedAt")
        VALUES ${Prisma.join(rows, ", ")}
      `);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: "An element with that id already exists", code: "ELEMENT_EXISTS" });
    return sendRouteError(res, error, "Unable to add elements");
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.elements_created", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: items.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.status(201).json({ created: items.length, ids: items.map((item) => item.id), version: expectedVersion + 1 });
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/elements/bulk-update", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = elementUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid elements" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion, updates } = parsed.data;
  const ids = updates.map((update) => update.elementId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "An element can only be updated once per request" });

  try {
    await mutateDraftPlan(exhibitionId, floorPlanId, expectedVersion, async (tx, plan) => {
      const current = await tx.$queryRaw<Array<{ id: string; type: string; label: string | null; x: number; y: number; width: number; height: number }>>(Prisma.sql`
        SELECT id, type::text AS type, label, x, y, width, height FROM "floor_plan_elements"
        WHERE "floorPlanId" = ${floorPlanId} AND id IN (${Prisma.join(ids)})
      `);
      if (current.length !== ids.length) throw Object.assign(new Error("Element not found"), { status: 404 });
      const byId = new Map(current.map((row) => [row.id, row]));
      for (const update of updates) {
        const row = byId.get(update.elementId)!;
        const type = update.type ?? row.type;
        const label = update.label !== undefined ? update.label?.trim() || null : row.label;
        requireLabelText(type, label);
        assertBounds(update.x ?? Number(row.x), update.y ?? Number(row.y), update.width ?? Number(row.width), update.height ?? Number(row.height), plan.canvasWidth, plan.canvasHeight);
        const assignments = [
          update.type !== undefined ? Prisma.sql`type = ${update.type}::"FloorPlanElementType"` : null,
          update.label !== undefined ? Prisma.sql`label = ${label}` : null,
          update.x !== undefined ? Prisma.sql`x = ${update.x}` : null,
          update.y !== undefined ? Prisma.sql`y = ${update.y}` : null,
          update.width !== undefined ? Prisma.sql`width = ${update.width}` : null,
          update.height !== undefined ? Prisma.sql`height = ${update.height}` : null,
          update.rotation !== undefined ? Prisma.sql`rotation = ${update.rotation}` : null,
          update.zIndex !== undefined ? Prisma.sql`"zIndex" = ${update.zIndex}` : null,
        ].filter((value): value is Prisma.Sql => value !== null);
        if (assignments.length === 0) continue;
        await tx.$executeRaw(Prisma.sql`
          UPDATE "floor_plan_elements" SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${update.elementId} AND "floorPlanId" = ${floorPlanId}
        `);
      }
    });
  } catch (error) {
    return sendRouteError(res, error, "Unable to update elements");
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.elements_updated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: updates.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.json({ ok: true, updated: updates.length, version: expectedVersion + 1 });
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/elements/bulk-delete", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = elementDeleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid elements" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const { expectedVersion } = parsed.data;
  const ids = Array.from(new Set(parsed.data.elementIds));
  try {
    await mutateDraftPlan(exhibitionId, floorPlanId, expectedVersion, async (tx) => {
      const deleted = await tx.$executeRaw(Prisma.sql`
        DELETE FROM "floor_plan_elements" WHERE "floorPlanId" = ${floorPlanId} AND id IN (${Prisma.join(ids)})
      `);
      if (deleted !== ids.length) throw Object.assign(new Error("Element not found"), { status: 404 });
    });
  } catch (error) {
    return sendRouteError(res, error, "Unable to remove elements");
  }
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.elements_deleted", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId, count: ids.length, expectedVersion, newVersion: expectedVersion + 1 } });
  return res.json({ ok: true, deleted: ids.length, version: expectedVersion + 1 });
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
      const sources = await tx.$queryRaw<Array<{ hallId: string; name: string; status: string; backgroundUrl: string | null; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
        SELECT "hallId", name, status, "backgroundUrl", "canvasWidth", "canvasHeight" FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (sources.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      const source = sources[0];
      if (source.status === "draft") throw Object.assign(new Error("This floor plan is already a draft"), { status: 409 });

      const drafts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "floor_plans" WHERE "hallId" = ${source.hallId} AND status = 'draft' LIMIT 1
      `);
      if (drafts.length) throw Object.assign(new Error("A draft floor plan already exists. Continue editing it instead."), { status: 409, code: "FLOOR_PLAN_DRAFT_EXISTS" });

      const names = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM "floor_plans" WHERE "hallId" = ${source.hallId}
      `);
      const taken = new Set(names.map((row) => row.name));
      const base = source.name.replace(/ \(draft(?: \d+)?\)$/, "").slice(0, 100);
      draftName = `${base} (draft)`;
      for (let n = 2; taken.has(draftName); n += 1) draftName = `${base} (draft ${n})`;

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plans" (id, "exhibitionId", "hallId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "updatedAt")
        VALUES (${newId}, ${exhibitionId}, ${source.hallId}, ${draftName}, 'draft', 1, ${source.backgroundUrl}, ${source.canvasWidth}, ${source.canvasHeight}, CURRENT_TIMESTAMP)
      `);
      // An older (archived) plan can hold stalls that now sit in another hall.
      const copied = await tx.$queryRaw<Array<{ stallId: string }>>(Prisma.sql`
        SELECT "stallId" FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
      `);
      await assertPlacementAllowed(tx, exhibitionId, newId, copied.map((row) => row.stallId));
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
        SELECT gen_random_uuid()::text, ${newId}, "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", CURRENT_TIMESTAMP
        FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "floor_plan_elements" (id, "floorPlanId", type, label, x, y, width, height, rotation, "zIndex", "updatedAt")
        SELECT gen_random_uuid()::text, ${newId}, type, label, x, y, width, height, rotation, "zIndex", CURRENT_TIMESTAMP
        FROM "floor_plan_elements" WHERE "floorPlanId" = ${floorPlanId}
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

// ---------------------------------------------------------------------------
// Halls
// ---------------------------------------------------------------------------
const hallNameSchema = z.string().trim().min(1, "Give the hall a name").max(80);
const hallCreateSchema = z.object({ name: hallNameSchema });
const hallUpdateSchema = z
  .object({ name: hallNameSchema.optional(), sortOrder: z.number().int().min(0).max(1000).optional() })
  .refine((value) => value.name !== undefined || value.sortOrder !== undefined, { message: "Nothing to update" });

router.get("/:exhibitionId/halls", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:view"))) return res.status(404).json({ error: "Exhibition not found" });

  const halls = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT h.id, h."exhibitionId", h.name, h."sortOrder", h."createdAt", h."updatedAt",
      (SELECT p.id FROM "floor_plans" p WHERE p."hallId" = h.id AND p.status = 'published' LIMIT 1) AS "publishedPlanId",
      (SELECT p.id FROM "floor_plans" p WHERE p."hallId" = h.id AND p.status = 'draft' LIMIT 1) AS "draftPlanId",
      (SELECT COUNT(DISTINCT o."stallId")::int FROM "floor_plan_objects" o JOIN "floor_plans" p ON p.id = o."floorPlanId"
        WHERE p."hallId" = h.id AND p.status IN ('draft', 'published')) AS "stallCount"
    FROM "exhibition_halls" h
    WHERE h."exhibitionId" = ${exhibitionId}
    ORDER BY h."sortOrder" ASC, h."createdAt" ASC, h.id ASC
  `);
  return res.json({ halls });
});

router.post("/:exhibitionId/halls", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  const parsed = hallCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid hall" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const id = crypto.randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`exhibition-halls:${exhibitionId}`}, 0))`);
      const counted = await tx.$queryRaw<Array<{ count: number; next: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count, COALESCE(MAX("sortOrder"), -1) + 1 AS next FROM "exhibition_halls" WHERE "exhibitionId" = ${exhibitionId}
      `);
      if (counted[0].count >= MAX_HALLS_PER_EXHIBITION) {
        throw Object.assign(new Error(`An exhibition can have at most ${MAX_HALLS_PER_EXHIBITION} halls`), { status: 400 });
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "exhibition_halls" (id, "exhibitionId", name, "sortOrder", "updatedAt")
        VALUES (${id}, ${exhibitionId}, ${parsed.data.name}, ${counted[0].next}, CURRENT_TIMESTAMP)
      `);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: "A hall with this name already exists", code: "HALL_NAME_EXISTS" });
    return sendRouteError(res, error, "Unable to create the hall");
  }
  await logAudit({ actorUserId: req.user!.id, action: "exhibition_hall.created", entityType: "ExhibitionHall", entityId: id, metadata: { exhibitionId, name: parsed.data.name } });
  return res.status(201).json({ hall: { id, exhibitionId, name: parsed.data.name } });
});

router.patch("/:exhibitionId/halls/:hallId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const hallId = parseId(req.params.hallId);
  if (!exhibitionId || !hallId) return res.status(400).json({ error: "Invalid id" });
  const parsed = hallUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid hall" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const assignments = [
    parsed.data.name !== undefined ? Prisma.sql`name = ${parsed.data.name}` : null,
    parsed.data.sortOrder !== undefined ? Prisma.sql`"sortOrder" = ${parsed.data.sortOrder}` : null,
  ].filter((value): value is Prisma.Sql => value !== null);
  try {
    const updated = await prisma.$executeRaw(Prisma.sql`
      UPDATE "exhibition_halls" SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${hallId} AND "exhibitionId" = ${exhibitionId}
    `);
    if (updated === 0) return res.status(404).json({ error: "Hall not found" });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: "A hall with this name already exists", code: "HALL_NAME_EXISTS" });
    throw error;
  }
  await logAudit({ actorUserId: req.user!.id, action: "exhibition_hall.updated", entityType: "ExhibitionHall", entityId: hallId, metadata: { exhibitionId, ...parsed.data } });
  return res.json({ ok: true });
});

// Deleting a hall deletes its plans (drafts, the published plan and history). It is
// refused while any stall on its published plan is reserved or sold: those exhibitors
// were shown that map, and the stalls themselves are never touched.
router.delete("/:exhibitionId/halls/:hallId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const hallId = parseId(req.params.hallId);
  if (!exhibitionId || !hallId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  try {
    await prisma.$transaction(async (tx) => {
      const halls = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "exhibition_halls" WHERE id = ${hallId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
      `);
      if (halls.length === 0) throw Object.assign(new Error("Hall not found"), { status: 404 });
      // Same lock publishing takes, so a plan cannot go live while the hall is being removed.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`floor-plan-publish:${hallId}`}, 0))`);
      const booked = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "floor_plan_objects" o
        JOIN "floor_plans" p ON p.id = o."floorPlanId"
        JOIN "stalls" s ON s.id = o."stallId"
        WHERE p."hallId" = ${hallId} AND p.status = 'published' AND s.status <> 'available'
      `);
      if (booked[0].count > 0) {
        throw Object.assign(new Error("Stalls in this hall are already reserved or sold, so it can't be deleted."), { status: 409, code: "HALL_HAS_BOOKED_STALLS" });
      }
      await tx.$executeRaw(Prisma.sql`DELETE FROM "exhibition_halls" WHERE id = ${hallId} AND "exhibitionId" = ${exhibitionId}`);
    });
  } catch (error) {
    return sendRouteError(res, error, "Unable to delete the hall");
  }
  await logAudit({ actorUserId: req.user!.id, action: "exhibition_hall.deleted", entityType: "ExhibitionHall", entityId: hallId, metadata: { exhibitionId } });
  return res.json({ ok: true });
});

export default router;
