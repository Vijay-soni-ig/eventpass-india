import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/events/:id/partners/specialized", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const module = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId: event.id, moduleType: "PARTNERS" } },
    select: { enabled: true },
  });
  if (!module?.enabled) return res.status(404).json({ error: "Partner directory not available" });

  const partners = await prisma.eventParticipant.findMany({
    where: {
      eventId: event.id,
      participantType: "PARTNER",
      status: "ACTIVE",
      isPublic: true,
      archivedAt: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      organization: true,
      bio: true,
      photoUrl: true,
      sortOrder: true,
      website: true,
      email: true,
      phone: true,
      partnerProfile: {
        select: {
          partnerCategory: true,
          relationshipSummary: true,
          contributionSummary: true,
          engagementModel: true,
          displayLabel: true,
          displayDescription: true,
          displayOrder: true,
          showContact: true,
          showWebsite: true,
        },
      },
    },
  });

  const safePartners = partners
    .map((partner) => ({
      ...partner,
      email: partner.partnerProfile?.showContact ? partner.email : null,
      phone: partner.partnerProfile?.showContact ? partner.phone : null,
      website: partner.partnerProfile?.showWebsite ? partner.website : null,
    }))
    .sort((a, b) => {
      const orderA = a.partnerProfile?.displayOrder ?? a.sortOrder;
      const orderB = b.partnerProfile?.displayOrder ?? b.sortOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

  return res.json({ partners: safePartners });
});

export default router;
