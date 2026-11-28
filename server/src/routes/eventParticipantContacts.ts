import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const CONTACT_TYPES = ["PRIMARY", "SECONDARY", "OPERATIONS", "SALES", "OTHER"] as const;
const phoneSchema = z.string().trim().min(7).max(30).regex(/^[+()\d\s.-]+$/, "Invalid phone number").nullable().optional();
const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  designation: z.string().trim().max(150).nullable().optional(),
  contactType: z.enum(CONTACT_TYPES).default("SECONDARY"),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

const MODULE_DISABLED = "The PARTICIPANTS module is not enabled for this event";

async function loadParticipant(tx: Prisma.TransactionClient, eventId: string, participantId: string) {
  return tx.eventParticipant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true, archivedAt: true },
  });
}

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts). Contacts carry personal
// email/phone data, so a revoked or downgraded member must not read or change
// them.

router.get("/:eventId/participants/:participantId/contacts", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const participant = await loadParticipant(tx, event.id, req.params.participantId);
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) return reply(409, { error: "Participant is archived. Restore it before accessing contacts." });

  const contacts = await tx.eventParticipantContact.findMany({
    where: { participantId: participant.id, archivedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return reply(200, { contacts });
}));

router.post("/:eventId/participants/:participantId/contacts", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const participant = await loadParticipant(tx, event.id, req.params.participantId);
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) return reply(409, { error: "Participant is archived. Restore it before managing contacts." });

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  if (parsed.data.isPrimary) {
    await tx.eventParticipantContact.updateMany({
      where: { participantId: participant.id, archivedAt: null },
      data: { isPrimary: false },
    });
  }
  const contact = await tx.eventParticipantContact.create({
    data: {
      eventId: event.id,
      participantId: participant.id,
      ...parsed.data,
      contactType: parsed.data.isPrimary ? "PRIMARY" : parsed.data.contactType,
    },
  });
  return reply(201, { contact }, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.created",
    entityType: "EventParticipantContact",
    entityId: contact.id,
    metadata: { eventId: event.id, participantId: participant.id, isPrimary: contact.isPrimary },
  }));
}));

router.patch("/:eventId/participants/:participantId/contacts/:contactId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const participant = await loadParticipant(tx, event.id, req.params.participantId);
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) return reply(409, { error: "Participant is archived. Restore it before managing contacts." });

  const existing = await tx.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id },
  });
  if (!existing) return reply(404, { error: "Contact not found" });
  if (existing.archivedAt) return reply(409, { error: "Contact is archived. Restore it before editing." });

  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  const makePrimary = parsed.data.isPrimary === true;
  if (makePrimary) {
    await tx.eventParticipantContact.updateMany({
      where: { participantId: participant.id, archivedAt: null, id: { not: existing.id } },
      data: { isPrimary: false },
    });
  }
  const data = { ...parsed.data };
  if (makePrimary) data.contactType = "PRIMARY";
  const contact = await tx.eventParticipantContact.update({ where: { id: existing.id }, data });
  return reply(200, { contact }, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.updated",
    entityType: "EventParticipantContact",
    entityId: contact.id,
    metadata: { eventId: event.id, participantId: participant.id, changedFields: Object.keys(parsed.data) },
  }));
}));

router.delete("/:eventId/participants/:participantId/contacts/:contactId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const participant = await loadParticipant(tx, event.id, req.params.participantId);
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) return reply(409, { error: "Participant is archived. Restore it before managing contacts." });

  const existing = await tx.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id, archivedAt: null },
  });
  if (!existing) return reply(404, { error: "Contact not found" });

  await tx.eventParticipantContact.update({ where: { id: existing.id }, data: { archivedAt: new Date(), isPrimary: false } });
  if (existing.isPrimary) {
    const fallback = await tx.eventParticipantContact.findFirst({
      where: { participantId: participant.id, archivedAt: null, id: { not: existing.id } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    if (fallback) await tx.eventParticipantContact.update({ where: { id: fallback.id }, data: { isPrimary: true, contactType: "PRIMARY" } });
  }
  return reply(204, undefined, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.archived",
    entityType: "EventParticipantContact",
    entityId: existing.id,
    metadata: { eventId: event.id, participantId: participant.id, wasPrimary: existing.isPrimary },
  }));
}));

router.post("/:eventId/participants/:participantId/contacts/:contactId/restore", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const participant = await loadParticipant(tx, event.id, req.params.participantId);
  if (!participant) return reply(404, { error: "Participant not found" });
  if (participant.archivedAt) return reply(409, { error: "Participant is archived. Restore it before managing contacts." });

  const existing = await tx.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id, archivedAt: { not: null } },
  });
  if (!existing) return reply(404, { error: "Archived contact not found" });

  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  const makePrimary = parsed.data.isPrimary === true;
  if (makePrimary) {
    await tx.eventParticipantContact.updateMany({
      where: { participantId: participant.id, archivedAt: null },
      data: { isPrimary: false },
    });
  }
  const restored = await tx.eventParticipantContact.update({
    where: { id: existing.id },
    data: { archivedAt: null, ...parsed.data, ...(makePrimary ? { contactType: "PRIMARY" } : {}) },
  });
  return reply(200, { contact: restored }, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.restored",
    entityType: "EventParticipantContact",
    entityId: restored.id,
    metadata: { eventId: event.id, participantId: participant.id, isPrimary: restored.isPrimary },
  }));
}));

export default router;
