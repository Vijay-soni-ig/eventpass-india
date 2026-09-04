import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requirePlatformAdmin);

// Minimal cross-tenant visibility proving the PLATFORM_ADMIN role and its
// permission wiring work end to end. A full admin console (moderation,
// user management, etc.) is a separate, later feature.
router.get("/exhibitions", async (_req, res) => {
  const exhibitions = await prisma.exhibition.findMany({
    include: { organizer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ exhibitions });
});

export default router;
