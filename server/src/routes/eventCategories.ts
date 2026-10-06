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

const categoryListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  active: z.enum(["true", "false", "all"]).default("all"),
  parentCategoryId: z.string().uuid().nullable().optional(),
  sort: z.enum(["order", "name", "newest", "oldest"]).default("order"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get("/", async (req, res) => {
  const parsed = categoryListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { search, active, parentCategoryId, sort, page, limit } = parsed.data;
  const where = {
    ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
    ...(parentCategoryId !== undefined ? { parentCategoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "name"
      ? [{ name: "asc" as const }, { id: "asc" as const }]
      : sort === "newest"
        ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
        : sort === "oldest"
          ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
          : [{ sortOrder: "asc" as const }, { name: "asc" as const }, { id: "asc" as const }];

  const [categories, total] = await Promise.all([
    prisma.eventCategory.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventCategory.count({ where }),
  ]);

  res.json({ categories, total, page, pageSize: limit });
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
    const parent = await prisma.eventCategory.findUnique({ where: { id: parentCategoryId }, select: { id: true, active: true } });
    if (!parent) return res.status(400).json({ error: "parentCategoryId does not reference an existing category" });
    if (!parent.active) return res.status(400).json({ error: "parentCategoryId must reference an active Event Category" });
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

  // PATCH must enforce the same hierarchy invariant as DELETE/archive. Without
  // this guard, an admin could bypass the DELETE protection by setting
  // active:false directly and leave active children under an archived parent.
  if (data.active === false && existing.active) {
    const activeChildCount = await prisma.eventCategory.count({
      where: { parentCategoryId: existing.id, active: true },
    });
    if (activeChildCount > 0) {
      return res.status(409).json({
        error: "Cannot archive a category while it has active child categories",
        activeChildCount,
      });
    }
  }

  if (data.active === true && !existing.active && existing.parentCategoryId) {
    const parent = await prisma.eventCategory.findUnique({
      where: { id: existing.parentCategoryId },
      select: { id: true, active: true },
    });
    if (!parent?.active) {
      return res.status(400).json({ error: "Cannot restore a category while its parent category is archived" });
    }
  }

  if (data.parentCategoryId !== undefined) {
    if (data.parentCategoryId) {
      const parent = await prisma.eventCategory.findUnique({ where: { id: data.parentCategoryId }, select: { id: true, active: true } });
      if (!parent) return res.status(400).json({ error: "parentCategoryId does not reference an existing category" });
      if (!parent.active) return res.status(400).json({ error: "parentCategoryId must reference an active Event Category" });
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

  // Do not leave active children pointing at an archived parent. That would make
  // the taxonomy structurally inconsistent and would surface children whose
  // parent cannot be selected in organizer workflows. Archive the leaf first,
  // or archive the subtree explicitly if that becomes a future business rule.
  const activeChildCount = await prisma.eventCategory.count({
    where: { parentCategoryId: existing.id, active: true },
  });
  if (activeChildCount > 0) {
    return res.status(409).json({
      error: "Cannot archive a category while it has active child categories",
      activeChildCount,
    });
  }

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
