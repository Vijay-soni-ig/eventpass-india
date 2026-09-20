import { Router } from "express";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { prisma } from "../lib/prisma";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// Read-only taxonomy for organizer workflows. Mutations remain platform-admin-only
// under /api/platform/event-categories.
router.get("/", async (req, res) => {
  const activeOnly = req.query.active !== "false";
  const categories = await prisma.eventCategory.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, parentCategoryId: true, active: true, sortOrder: true },
  });
  res.json({ categories });
});

export default router;
