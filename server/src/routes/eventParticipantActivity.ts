import { Router } from "express";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

// Runs under the organizer row lock with membership/permission re-read inside
// it (see lib/lockedEventRoute.ts): the activity feed exposes actor names and
// emails, so a revoked member must not receive it.
router.get("/:eventId/participants/:participantId/activity", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) {
    return reply(409, { error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const participant = await tx.eventParticipant.findFirst({
    where: { id: req.params.participantId, eventId: event.id },
    select: { id: true, archivedAt: true },
  });
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) {
    return reply(409, { error: "Participant is archived. Restore it before accessing activity." });
  }

  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return reply(400, { error: "page must be >= 1 and limit must be 1-100" });
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
    tx.auditLog.findMany({
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
    tx.auditLog.count({ where }),
  ]);

  return reply(200, {
    items,
    total,
    page,
    pageSize: limit,
    hasNextPage: page * limit < total,
  });
}));

export default router;
