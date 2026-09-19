import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";
import { slugifyCategoryName } from "../lib/eventMapping";
import { assertNoCategoryCycle, CategoryCycleError } from "../lib/eventCategoryService";

const router = Router();

// ETX-EVENT-001C — EventCategory is a global taxonomy (no organizerId), so
// it's managed by platform admins only, mirroring routes/platform.ts's
// existing requirePlatformAdmin convention rather than the organizer
// permission matrix.
router.use(requireAuth, requirePlatformAdmin);

router.get("/", async (req, res) => {
  const activeOnly = req.query.active === "true";
  const categories = await prisma.eventCategory.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json({ categories });
});

router.get("/:id", async (req, res) => {
  const category = await prisma.eventCategory.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Category not found" });
  res.json({ category });
});

const createCategorySchema = z.object({
  name: z.string().min(1),
  // Explicit slug is optional — deterministically derived from `name` via
  // the same slugifyCategoryName() the 001B backfill and live Exhibition
  // linking (lib/eventMapping.ts) already use, so an admin-created category
  // and one that later gets auto-resolved from free-text Exhibition data
  // can never diverge for the same name.
  slug: z.string().optional(),
  description: z.string().optional(),
  parentCategoryId: z.string().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

router.post("/", eventMutationRateLimit, async (req, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { name, slug, description, parentCategoryId, active, sortOrder } = parsed.data;
  const resolvedSlug = slug?.trim() || slugifyCategoryName(name);
  if (!resolvedSlug) return res.status(400).json({ error: "Could not derive a valid slug from name" });

  if (parentCategoryId) {
    const parent = await prisma.eventCategory.findUnique({ where: { id: parentCategoryId } });
    if (!parent) return res.status(400).json({ error: "parentCategoryId does not reference an existing category" });
  }

  let category;
  try {
    category = await prisma.eventCategory.create({
      data: { name, slug: resolvedSlug, description, parentCategoryId: parentCategoryId ?? null, active, sortOrder },
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: `A category with slug "${resolvedSlug}" already exists` });
    }
    throw err;
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventCategory.created",
    entityType: "EventCategory",
    entityId: category.id,
    metadata: { name: category.name, slug: category.slug },
  });

  res.status(201).json({ category });
});

const updateCategorySchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().nullable(),
    parentCategoryId: z.string().nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial();

router.patch("/:id", eventMutationRateLimit, async (req, res) => {
  const existing = await prisma.eventCategory.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Category not found" });

  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;

  if (data.parentCategoryId !== undefined) {
    if (data.parentCategoryId) {
      const parent = await prisma.eventCategory.findUnique({ where: { id: data.parentCategoryId } });
      if (!parent) return res.status(400).json({ error: "parentCategoryId does not reference an existing category" });
    }
    try {
      await assertNoCategoryCycle(existing.id, data.parentCategoryId);
    } catch (err) {
      if (err instanceof CategoryCycleError) return res.status(400).json({ error: err.message });
      throw err;
    }
  }

  let category;
  try {
    category = await prisma.eventCategory.update({ where: { id: existing.id }, data });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: `A category with slug "${data.slug}" already exists` });
    }
    throw err;
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventCategory.updated",
    entityType: "EventCategory",
    entityId: category.id,
    metadata: { changedFields: Object.keys(data) },
  });

  res.json({ category });
});

router.delete("/:id", eventMutationRateLimit, async (req, res) => {
  const existing = await prisma.eventCategory.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Category not found" });

  // Archive, not delete — matches this codebase's one existing precedent
  // (OrganizerGalleryMedia's soft-archive DELETE). No schema change needed:
  // EventCategory already has `active`, reused as the archive flag; the DB's
  // own onDelete: Restrict on the self-relation is never bypassed since this
  // never issues an actual DELETE.
  const category = await prisma.eventCategory.update({ where: { id: existing.id }, data: { active: false } });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventCategory.archived",
    entityType: "EventCategory",
    entityId: category.id,
    metadata: {},
  });

  res.status(204).send();
});

export default router;
