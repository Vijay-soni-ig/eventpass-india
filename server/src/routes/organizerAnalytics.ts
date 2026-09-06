import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { getOrganizerDashboard, getExhibitionAnalytics } from "../lib/analyticsService";
import { prisma } from "../lib/prisma";
import { dateString } from "../lib/validation";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

const rangeSchema = z.object({
  exhibitionId: z.string().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

router.get("/dashboard", async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  // Every organizer role can see the operational counts (exhibitions,
  // stalls, visitors, check-ins); revenue and lead figures are only
  // included if the caller's role actually grants that visibility —
  // finance sees money without leads, marketing sees leads without money,
  // owner/admin see both. Never a blanket dashboard everyone gets in full.
  const [viewIds, revenueIds, leadIds] = await Promise.all([
    organizerIdsWithPermission(req.user!, "exhibition:view"),
    organizerIdsWithPermission(req.user!, "payment:view"),
    organizerIdsWithPermission(req.user!, "lead:analytics"),
  ]);
  if (viewIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to view analytics" });
  }

  const metrics = await getOrganizerDashboard(viewIds, {
    exhibitionId: parsed.data.exhibitionId,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    includeRevenue: revenueIds.length > 0,
    includeLeads: leadIds.length > 0,
  });

  res.json(metrics);
});

router.get("/exhibitions/:id", async (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const viewIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  const exhibition = viewIds.length
    ? await prisma.exhibition.findFirst({ where: { id: req.params.id, organizerId: { in: viewIds } } })
    : null;
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const [revenueIds, leadIds] = await Promise.all([
    organizerIdsWithPermission(req.user!, "payment:view"),
    organizerIdsWithPermission(req.user!, "lead:analytics"),
  ]);

  const analytics = await getExhibitionAnalytics(exhibition.id, {
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
    includeRevenue: revenueIds.includes(exhibition.organizerId),
    includeLeads: leadIds.includes(exhibition.organizerId),
  });

  res.json(analytics);
});

export default router;
