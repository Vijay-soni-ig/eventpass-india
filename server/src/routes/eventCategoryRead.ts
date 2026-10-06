import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { organizerIdsWithPermission } from "../lib/access";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// Read-only taxonomy for organizer workflows. Mutations remain platform-admin-only
// under /api/platform/event-categories.
router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const permittedOrganizerIds = await organizerIdsWithPermission(req.user!, "event:view");
  if (permittedOrganizerIds.length === 0) {
    return res.json({ categories: [], total: 0, page: parsed.data.page, pageSize: parsed.data.limit });
  }

  const { search, active, page, limit } = parsed.data;
  const where = {
    ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
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

  const [categories, total] = await Promise.all([
    prisma.eventCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, slug: true, description: true, parentCategoryId: true, active: true, sortOrder: true },
    }),
    prisma.eventCategory.count({ where }),
  ]);

  res.json({ categories, total, page, pageSize: limit });
});

router.get("/:id", async (req, res) => {
  const permittedOrganizerIds = await organizerIdsWithPermission(req.user!, "event:view");
  if (permittedOrganizerIds.length === 0) return res.status(404).json({ error: "Event Category not found" });

  const category = await prisma.eventCategory.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, slug: true, description: true, parentCategoryId: true, active: true, sortOrder: true },
  });
  if (!category) return res.status(404).json({ error: "Event Category not found" });

  res.json({ category });
});

export default router;
