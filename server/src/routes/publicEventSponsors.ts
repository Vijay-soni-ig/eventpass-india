import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/events/:id/sponsors", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      moduleEnablements: { some: { moduleType: "SPONSORS", enabled: true } },
    },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const sponsors = await prisma.eventParticipant.findMany({
    where: { eventId: event.id, participantType: "SPONSOR", status: "ACTIVE", isPublic: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      organization: true,
      bio: true,
      photoUrl: true,
      sortOrder: true,
      sponsorProfile: {
        select: {
          logoUrl: true,
          brandPrimaryColor: true,
          brandSecondaryColor: true,
          displayWebsite: true,
          package: {
            select: {
              name: true,
              description: true,
              benefits: true,
              deliverables: true,
              sortOrder: true,
              status: true,
            },
          },
          benefitsOverride: true,
          deliverablesOverride: true,
        },
      },
    },
  });

  return res.json({ sponsors });
});

export default router;
