import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const idSchema = z.string().uuid();
const statusSchema = z.enum(["draft", "published", "archived"]);
const numberSchema = z.number().finite();

const createPlanSchema = z.object({
  exhibitionId: idSchema,
  name: z.string().trim().min(1).max(120),
  canvasWidth: z.number().finite().positive().max(100000),
  canvasHeight: z.number().finite().positive().max(100000),
  backgroundUrl: z.string().url().max(2048).nullable().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  canvasWidth: z.number().finite().positive().max(100000).optional(),
  canvasHeight: z.number().finite().positive().max(100000).optional(),
  backgroundUrl: z.string().url().max(2048).nullable().optional(),
  status: statusSchema.optional(),
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

const updateObjectSchema = objectSchema.partial().extend({ stallId: idSchema.optional() });

function parseId(value: string) {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function organizerScope(userId: string, permission: "exhibition:view" | "exhibition:update") {
  return organizerIdsWithPermission({ id: userId } as Express.Request["user"], permission);
}

async function loadExhibitionForUser(exhibitionId: string, userId: string, permission: "exhibition:view" | "exhibition:update") {
  const organizerIds = await organizerScope(userId, permission);
  if (organizerIds.length === 0) return null;
  return prisma.exhibition.findFirst({
    where: { id: exhibitionId, organizerId: { in: organizerIds } },
    select: { id: true, organizerId: true },
  });
}

function boundsError(x: number, y: number, width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (x + width > canvasWidth || y + height > canvasHeight) {
    return "Floor plan object must remain within canvas bounds";
  }
  return null;
}

router.get("/exhibitions/:exhibitionId/floor-plan-layouts", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:view");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans"
    WHERE "exhibitionId" = ${exhibitionId}
    ORDER BY "updatedAt" DESC
  `);
  res.json({ floorPlans: plans });
});

router.get("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:view");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "publishedAt", "createdAt", "updatedAt"
    FROM "floor_plans"
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId}
    LIMIT 1
  `);
  if (plans.length === 0) return res.status(404).json({ error: "Floor plan not found" });

  const objects = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "createdAt", "updatedAt"
    FROM "floor_plan_objects"
    WHERE "floorPlanId" = ${floorPlanId}
    ORDER BY "zIndex" ASC, "createdAt" ASC
  `);
  res.json({ floorPlan: plans[0], objects });
});

router.post("/exhibitions/:exhibitionId/floor-plan-layouts", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  if (!exhibitionId) return res.status(400).json({ error: "Invalid exhibition id" });
  const parsed = createPlanSchema.safeParse({ ...req.body, exhibitionId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan" });

  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const id = crypto.randomUUID();
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "floor_plans" (id, "exhibitionId", name, status, version, "backgroundUrl", "canvasWidth", "canvasHeight", "updatedAt")
      VALUES (${id}, ${exhibitionId}, ${parsed.data.name}, 'draft', 1, ${parsed.data.backgroundUrl ?? null}, ${parsed.data.canvasWidth}, ${parsed.data.canvasHeight}, CURRENT_TIMESTAMP)
    `);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A floor plan with this name already exists for the exhibition" });
    }
    throw err;
  }

  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.created", entityType: "FloorPlan", entityId: id, metadata: { exhibitionId, name: parsed.data.name } });
  res.status(201).json({ floorPlan: { id, exhibitionId, name: parsed.data.name, status: "draft", version: 1 } });
});

router.patch("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const current = await prisma.$queryRaw<Array<{ canvasWidth: number; canvasHeight: number; status: string }>>(Prisma.sql`
    SELECT "canvasWidth", "canvasHeight", status FROM "floor_plans"
    WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (current.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (current[0].status === "published" && parsed.data.status !== "archived") {
    return res.status(409).json({ error: "Published floor plans are immutable; create a draft before editing" });
  }

  const canvasWidth = parsed.data.canvasWidth ?? Number(current[0].canvasWidth);
  const canvasHeight = parsed.data.canvasHeight ?? Number(current[0].canvasHeight);
  const objects = await prisma.$queryRaw<Array<{ x: number; y: number; width: number; height: number }>>(Prisma.sql`
    SELECT x, y, width, height FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
  `);
  if (objects.some((o) => boundsError(Number(o.x), Number(o.y), Number(o.width), Number(o.height), canvasWidth, canvasHeight))) {
    return res.status(409).json({ error: "Canvas size would invalidate existing floor plan objects" });
  }

  const fields = [
    parsed.data.name !== undefined ? Prisma.sql`name = ${parsed.data.name}` : Prisma.empty,
    parsed.data.canvasWidth !== undefined ? Prisma.sql`"canvasWidth" = ${parsed.data.canvasWidth}` : Prisma.empty,
    parsed.data.canvasHeight !== undefined ? Prisma.sql`"canvasHeight" = ${parsed.data.canvasHeight}` : Prisma.empty,
    parsed.data.backgroundUrl !== undefined ? Prisma.sql`"backgroundUrl" = ${parsed.data.backgroundUrl}` : Prisma.empty,
    parsed.data.status !== undefined ? Prisma.sql`status = ${parsed.data.status}` : Prisma.empty,
    Prisma.sql`version = version + 1`,
    Prisma.sql`"updatedAt" = CURRENT_TIMESTAMP`,
  ].filter(Boolean);
  const query = Prisma.sql`UPDATE "floor_plans" SET ${Prisma.join(fields, ", ")} WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId}`;
  await prisma.$executeRaw(query);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.updated", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId } });
  res.json({ ok: true });
});

router.post("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId/objects", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const parsed = objectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const plans = await prisma.$queryRaw<Array<{ canvasWidth: number; canvasHeight: number; status: string }>>(Prisma.sql`
    SELECT "canvasWidth", "canvasHeight", status FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (plans.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (plans[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });
  const bounds = boundsError(parsed.data.x, parsed.data.y, parsed.data.width, parsed.data.height, Number(plans[0].canvasWidth), Number(plans[0].canvasHeight));
  if (bounds) return res.status(400).json({ error: bounds });

  const stalls = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "stalls" WHERE id = ${parsed.data.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (stalls.length === 0) return res.status(400).json({ error: "Stall does not belong to this exhibition" });
  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" = ${parsed.data.stallId} LIMIT 1
  `);
  if (duplicate.length > 0) return res.status(409).json({ error: "Stall is already mapped on this floor plan" });

  const id = crypto.randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "floor_plan_objects" (id, "floorPlanId", "stallId", x, y, width, height, rotation, "zIndex", "labelVisible", "updatedAt")
    VALUES (${id}, ${floorPlanId}, ${parsed.data.stallId}, ${parsed.data.x}, ${parsed.data.y}, ${parsed.data.width}, ${parsed.data.height}, ${parsed.data.rotation}, ${parsed.data.zIndex}, ${parsed.data.labelVisible}, CURRENT_TIMESTAMP)
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_created", entityType: "FloorPlanObject", entityId: id, metadata: { exhibitionId, floorPlanId, stallId: parsed.data.stallId } });
  res.status(201).json({ object: { id, floorPlanId, ...parsed.data } });
});

router.patch("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  const parsed = updateObjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid floor plan object" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const context = await prisma.$queryRaw<Array<{ status: string; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
    SELECT fp.status, fp."canvasWidth", fp."canvasHeight" FROM "floor_plans" fp WHERE fp.id = ${floorPlanId} AND fp."exhibitionId" = ${exhibitionId} LIMIT 1
  `);
  if (context.length === 0) return res.status(404).json({ error: "Floor plan not found" });
  if (context[0].status !== "draft") return res.status(409).json({ error: "Only draft floor plans can be edited" });

  const current = await prisma.$queryRaw<Array<{ stallId: string; x: number; y: number; width: number; height: number; rotation: number; zIndex: number; labelVisible: boolean }>>(Prisma.sql`
    SELECT "stallId", x, y, width, height, rotation, "zIndex", "labelVisible" FROM "floor_plan_objects" WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId} LIMIT 1
  `);
  if (current.length === 0) return res.status(404).json({ error: "Floor plan object not found" });
  const value = { ...current[0], ...parsed.data };
  if (parsed.data.stallId) {
    const stalls = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "stalls" WHERE id = ${parsed.data.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1`);
    if (stalls.length === 0) return res.status(400).json({ error: "Stall does not belong to this exhibition" });
  }
  const bounds = boundsError(Number(value.x), Number(value.y), Number(value.width), Number(value.height), Number(context[0].canvasWidth), Number(context[0].canvasHeight));
  if (bounds) return res.status(400).json({ error: bounds });

  const duplicate = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId} AND "stallId" = ${value.stallId} AND id <> ${objectId} LIMIT 1
  `);
  if (duplicate.length > 0) return res.status(409).json({ error: "Stall is already mapped on this floor plan" });

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "floor_plan_objects"
    SET "stallId" = ${value.stallId}, x = ${value.x}, y = ${value.y}, width = ${value.width}, height = ${value.height}, rotation = ${value.rotation}, "zIndex" = ${value.zIndex}, "labelVisible" = ${value.labelVisible}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
  `);
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_updated", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId, stallId: value.stallId } });
  res.json({ ok: true });
});

router.delete("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  const objectId = parseId(req.params.objectId);
  if (!exhibitionId || !floorPlanId || !objectId) return res.status(400).json({ error: "Invalid id" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  const result = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "floor_plan_objects" WHERE id = ${objectId} AND "floorPlanId" = ${floorPlanId}
      AND EXISTS (SELECT 1 FROM "floor_plans" WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} AND status = 'draft')
  `);
  if (result === 0) return res.status(404).json({ error: "Floor plan object not found or floor plan is not editable" });
  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.object_deleted", entityType: "FloorPlanObject", entityId: objectId, metadata: { exhibitionId, floorPlanId } });
  res.status(204).send();
});

router.post("/exhibitions/:exhibitionId/floor-plan-layouts/:floorPlanId/publish", async (req, res) => {
  const exhibitionId = parseId(req.params.exhibitionId);
  const floorPlanId = parseId(req.params.floorPlanId);
  if (!exhibitionId || !floorPlanId) return res.status(400).json({ error: "Invalid id" });
  const exhibition = await loadExhibitionForUser(exhibitionId, req.user!.id, "exhibition:update");
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  try {
    await prisma.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<Array<{ id: string; canvasWidth: number; canvasHeight: number; status: string }>>(Prisma.sql`
        SELECT id, "canvasWidth", "canvasHeight", status FROM "floor_plans"
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId}
        FOR UPDATE
      `);
      if (plans.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
      if (plans[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be published"), { status: 409 });

      const objects = await tx.$queryRaw<Array<{ id: string; stallId: string; x: number; y: number; width: number; height: number }>>(Prisma.sql`
        SELECT id, "stallId", x, y, width, height FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
      `);
      if (objects.length === 0) throw Object.assign(new Error("At least one stall must be mapped before publishing"), { status: 400 });
      for (const object of objects) {
        const bounds = boundsError(Number(object.x), Number(object.y), Number(object.width), Number(object.height), Number(plans[0].canvasWidth), Number(plans[0].canvasHeight));
        if (bounds) throw Object.assign(new Error(`Object ${object.id} is outside the canvas`), { status: 400 });
        const stalls = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM "stalls" WHERE id = ${object.stallId} AND "exhibitionId" = ${exhibitionId} LIMIT 1
        `);
        if (stalls.length === 0) throw Object.assign(new Error(`Object ${object.id} references an invalid stall`), { status: 400 });
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET status = 'archived', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "exhibitionId" = ${exhibitionId} AND status = 'published' AND id <> ${floorPlanId}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "floor_plans" SET status = 'published', "publishedAt" = CURRENT_TIMESTAMP, version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId}
      `);
    });
  } catch (err) {
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    if (status < 500) return res.status(status).json({ error: err instanceof Error ? err.message : "Unable to publish floor plan" });
    throw err;
  }

  await logAudit({ actorUserId: req.user!.id, action: "floor_plan.published", entityType: "FloorPlan", entityId: floorPlanId, metadata: { exhibitionId } });
  res.json({ ok: true, status: "published" });
});

export default router;
