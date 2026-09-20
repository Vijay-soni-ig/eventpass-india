import { Router } from "express";
import { ParticipationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";

const router = Router();
router.use(requireAuth, requireExhibitorBusinessAccess);

router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:capture");
  if (!businessIds.length) return res.json({ contexts: [] });

  const participations = await prisma.exhibitionExhibitor.findMany({
    where: {
      exhibitorBusinessId: { in: businessIds },
      status: ParticipationStatus.confirmed,
    },
    select: {
      id: true,
      exhibitorBusinessId: true,
      exhibitionId: true,
      business: { select: { id: true, companyName: true } },
      exhibition: { select: { id: true, name: true, city: true, status: true } },
      stalls: { select: { id: true, code: true, status: true, exhibitionExhibitorId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const exhibitionIds = [...new Set(participations.map((p) => p.exhibitionId))];
  const events = exhibitionIds.length
    ? await prisma.event.findMany({
        where: { exhibitionId: { in: exhibitionIds }, archivedAt: null },
        select: { id: true, title: true, status: true, exhibitionId: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const eventByExhibition = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    if (!eventByExhibition.has(event.exhibitionId)) eventByExhibition.set(event.exhibitionId, event);
  }

  res.json({
    contexts: participations
      .map((p) => {
        const event = eventByExhibition.get(p.exhibitionId);
        if (!event) return null;
        return {
          participationId: p.id,
          exhibitorBusinessId: p.exhibitorBusinessId,
          exhibitionExhibitorId: p.id,
          exhibitionId: p.exhibitionId,
          exhibitionName: p.exhibition.name,
          eventId: event.id,
          eventTitle: event.title,
          eventStatus: event.status,
          business: p.business,
          stalls: p.stalls,
        };
      })
      .filter((context): context is NonNullable<typeof context> => Boolean(context)),
  });
});

export default router;
