import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { publishFloorPlan } from "../lib/floorPlanPublish";
import { floorPlanMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const idSchema = z.string().uuid();
const numberSchema = z.number().finite();
const planCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  canvasWidth: numberSchema.positive().max(100000),
  canvasHeight: numberSchema.positive().max(100000),
  backgroundUrl: z.string().url().max(2048).nullable().optional(),
});
const planUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  canvasWidth: numberSchema.positive().max(100000).optional(),
  canvasHeight: numberSchema.positive().max(100000).optional(),
  backgroundUrl: z.string().url().max(2048).nullable().optional(),
});
const objectSchema = z.object({
  stallId: idSchema,
  x: numberSchema.min(0).max(100000),
  y: numberSchema.min(0).max(100000),
  width: numberSchema.positive().max(100000),
  height: numberSchema.positive().max(100000),
  rotation: numberSchema.min(-360).max(360).default(0),
  zIndex: z.number().int().min(-100000).max(100000).default(0),
  labelVisible: z.boolean().default(true),
});
const objectUpdateSchema = objectSchema.partial();

type Permission = "exhibition:view" | "exhibition:update";

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

  const current = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
    SELECT status, "canvasWidth", "canvasHeight" FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (current.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (current[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });

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
  if (assignments.length === 0) return res.json({ ok: true });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "floor_plans" SET ${Prisma.join(assignments, ", ")}, version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft'
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.updated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId } });
  return res.json({ ok: true });
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
    SELECT status, "canvasWidth", "canvasHeight" FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (plans.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (plans[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });
  try { assertBounds(parsed.data.x, parsed.data.y, parsed.data.width, parsed.data.height, Number(plans[0].canvasWidth), Number(plans[0].canvasHeight)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid object bounds" }); }

  const stall = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "stalls" WHERE id = ${parsed.data.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (stall.length === 0) return res.status(400).json({ error: "Stall does not belong to this exhibition" });
  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" = ${parsed.data.stallId} LIMIT 1
  `);
  if (duplicate.length) return res.status(409).json({ error: "Stall is already mapped on this floor plan" });

  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
    VALUES (${id}, ${floorPlanId}, ${parsed.data.stallId}, ${parsed.data.x}, ${parsed.data.y}, ${parsed.data.width}, ${parsed.data.height}, ${parsed.data.rotation}, ${parsed.data.zIndex}, ${parsed.data.labelVisible}, CURRENT_TIMESTAMP)
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_created", entityType: "FloorPlanObject", entityId: id, metadata: { exhibitionId, floorPlanId, stallId: parsed.data.stallId } });
  return res.status(201).json({ object: { id, floorPlanId, ...parsed.data } });
});

router.patch("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  const context = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
    SELECT status, "canvasWidth", "canvasHeight" FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (context.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (context[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });
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
  if (assignments.length === 0) return res.json({ ok: true });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "floor_plan_objects" SET ${Prisma.join(assignments, ", ")}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
  `);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "floor_plans" SET version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft'
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_updated", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId, stallId: value.stallId } });
  return res.json({ ok: true });
});

router.delete("/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });
  const deleted = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "floor_plan_objects" WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
      AND EXISTS (SELECT 1 FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft')
  `);
  if (deleted === 0) return res.status(404).json({ error: "Floor plan object not found or floor plan is not editable" });
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_deleted", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId } });
  return res.status(204).send();
});

router.post("/:exhibitionId/floor-plan-layouts/:floorPlanId/publish", floorPlanMutationRateLimit, async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  if (!(await loadExhibition(exhibitionId, req.user, "exhibition:update"))) return res.status(404).json({ error: "Exhibition not found" });

  try {
    await publishFloorPlan(exhibitionId, floorPlanId);
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
