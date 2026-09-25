import { Router } from "express";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/events/:id/vendors/specialized", publicSearchRateLimit, async (req, res) => {
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
    where: { eventId_moduleType: { eventId: event.id, moduleType: "VENDORS" } },
    select: { enabled: true },
  });
  if (!module?.enabled) return res.status(404).json({ error: "Vendor directory not available" });

  const vendors = await prisma.eventParticipant.findMany({
    where: {
      eventId: event.id,
      participantType: "VENDOR",
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
      vendorProfile: {
        select: {
          contactName: true,
          serviceArea: true,
          operatingHours: true,
          displayWebsite: true,
          services: {
            where: { service: { status: "ACTIVE" } },
            orderBy: { sortOrder: "asc" },
            select: {
              sortOrder: true,
              service: {
                select: {
                  name: true,
                  description: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return res.json({ vendors });
});

export default router;
