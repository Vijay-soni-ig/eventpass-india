import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/events/:id/sessions", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      moduleEnablements: { some: { moduleType: "SESSIONS", enabled: true } },
    },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const sessions = await prisma.eventSession.findMany({
    where: { eventId: event.id, status: "PUBLISHED" },
    orderBy: [{ date: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      date: true,
      startTime: true,
      endTime: true,
      timezone: true,
      room: true,
      speakers: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          role: true,
          sortOrder: true,
          participant: {
            select: {
              id: true,
              name: true,
              title: true,
              organization: true,
              bio: true,
              photoUrl: true,
            },
          },
        },
      },
    },
  });

  const safeSessions = sessions.map((session) => ({
    ...session,
    speakers: session.speakers.filter((speaker) => speaker.participant !== null),
  }));
  return res.json({ sessions: safeSessions });
});

export default router;
