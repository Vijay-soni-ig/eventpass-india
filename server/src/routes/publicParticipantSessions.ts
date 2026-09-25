import { Router } from "express";
import { prisma } from "../lib/prisma";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/events/:id/participants/:participantId/sessions", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      moduleEnablements: { some: { moduleType: "PARTICIPANTS", enabled: true } },
    },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "Participant schedule not found" });

  const participant = await prisma.eventParticipant.findFirst({
    where: {
      id: req.params.participantId,
      eventId: event.id,
      participantType: "SPEAKER",
      status: "ACTIVE",
      isPublic: true,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (!participant) return res.status(404).json({ error: "Speaker not found" });

  const sessions = await prisma.eventSession.findMany({
    where: {
      eventId: event.id,
      status: "PUBLISHED",
      speakers: { some: { participantId: participant.id } },
    },
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
        where: { participant: { participantType: "SPEAKER", status: "ACTIVE", isPublic: true, archivedAt: null } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          role: true,
          participant: { select: { id: true, name: true, title: true, organization: true, photoUrl: true } },
        },
      },
    },
  });

  return res.json({ sessions });
});

export default router;
