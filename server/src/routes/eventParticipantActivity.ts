import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike) {
  const ids = await organizerIdsWithPermission(user, "event:view");
  if (!ids.length) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: ids }, archivedAt: null },
    select: { id: true },
  });
}

async function loadParticipant(eventId: string, participantId: string) {
  return prisma.eventParticipant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true },
  });
}

async function participantsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/participants/:participantId/activity", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!);
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) {
    return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });
  }

  const action = req.query.action ? String(req.query.action).trim() : undefined;
  const where = {
    OR: [
      { entityType: "EventParticipant", entityId: participant.id },
      { metadata: { path: ["participantId"], equals: participant.id } },
    ],
    ...(action ? { action } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actorUser: { select: { id: true, fullName: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return res.json({
    items,
    total,
    page,
    pageSize: limit,
    hasNextPage: page * limit < total,
  });
});

export default router;
