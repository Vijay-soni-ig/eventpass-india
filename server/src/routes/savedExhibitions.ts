import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { saveExhibitionRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

// Phase 23.3 — visitor/user -> exhibition "save" (bookmark one specific
// event). The actor here is the saver, not an organizer member, so — exactly
// like routes/organizerFollows.ts — this is mounted at its own prefix
// (/api/saved-exhibitions), never under /api/exhibitions: that router's
// router.use(requireAuth, requireOrganizerAccess) would wrongly demand
// organizer membership for what is a plain visitor action.
const router = Router();

router.use(requireAuth);

// Same visibility rule as GET /api/public/exhibitions/:id (routes/public.ts)
// — a save/unsave/save-state request must never reveal whether a draft,
// paused, or private exhibition id exists. Kept in exact sync with that
// route's own {status: {in:["live","completed"]}, visibility:"public"} filter.
const PUBLICLY_VISIBLE_WHERE = {
  status: { in: ["live", "completed"] as ("live" | "completed")[] },
  visibility: "public" as const,
};

async function getSaveState(exhibitionId: string, userId: string) {
  const existing = await prisma.savedExhibition.findUnique({
    where: { userId_exhibitionId: { userId, exhibitionId } },
  });
  return { saved: !!existing };
}

router.get("/:exhibitionId", async (req, res) => {
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: req.params.exhibitionId, ...PUBLICLY_VISIBLE_WHERE },
    select: { id: true },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  res.json(await getSaveState(exhibition.id, req.user!.id));
});

router.post("/:exhibitionId", saveExhibitionRateLimit, async (req, res) => {
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: req.params.exhibitionId, ...PUBLICLY_VISIBLE_WHERE },
    select: { id: true },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  try {
    await prisma.savedExhibition.create({ data: { exhibitionId: exhibition.id, userId: req.user!.id } });
    await logAudit({
      actorUserId: req.user!.id,
      action: "event.saved",
      entityType: "Exhibition",
      entityId: exhibition.id,
      metadata: { userId: req.user!.id },
    });
  } catch (err) {
    // P2002 = already saved (duplicate/race) — idempotent, not an error.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  res.json(await getSaveState(exhibition.id, req.user!.id));
});

router.delete("/:exhibitionId", saveExhibitionRateLimit, async (req, res) => {
  const exhibitionId = req.params.exhibitionId;
  const { count } = await prisma.savedExhibition.deleteMany({ where: { exhibitionId, userId: req.user!.id } });
  if (count > 0) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "event.unsaved",
      entityType: "Exhibition",
      entityId: exhibitionId,
      metadata: { userId: req.user!.id },
    });
  }

  res.json(await getSaveState(exhibitionId, req.user!.id));
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

// Phase 23.3 — the visitor's own saved-events list. Deliberately the user's
// own private data (never another user's), so no separate visibility filter
// is re-applied to the join itself — but a saved event that has since gone
// non-public (organizer reverted it to draft/paused/private after it was
// saved) must not leak its details back to the visitor either. Rather than
// silently dropping the row (confusing — "why did my save disappear?"), it's
// included with `available: false` and no exhibition fields beyond the id,
// matching ExhibitionDetail's own "unavailable" state pattern.
router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid pagination parameters" });
  const { page, limit } = parsed.data;

  const [total, saves] = await Promise.all([
    prisma.savedExhibition.count({ where: { userId: req.user!.id } }),
    prisma.savedExhibition.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        exhibition: {
          select: {
            id: true,
            name: true,
            category: true,
            coverImageUrl: true,
            venue: true,
            city: true,
            startDate: true,
            endDate: true,
            status: true,
            visibility: true,
            organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
            ticketTypes: { where: { visible: true }, select: { id: true, name: true, price: true, quantity: true } },
          },
        },
      },
    }),
  ]);

  const items = saves.map(({ id, createdAt, exhibition }) => {
    const isPubliclyVisible = exhibition.status !== "draft" && exhibition.status !== "paused" && exhibition.visibility === "public";
    if (!isPubliclyVisible) {
      return { id, createdAt, available: false, exhibition: { id: exhibition.id } };
    }
    const { visibility: _visibility, ...safeExhibition } = exhibition;
    return { id, createdAt, available: true, exhibition: safeExhibition };
  });

  res.json({ items, total, page, pageSize: limit });
});

export default router;
