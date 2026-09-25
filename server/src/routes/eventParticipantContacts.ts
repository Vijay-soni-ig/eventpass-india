import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
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

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: ids }, archivedAt: null }, select: { id: true } });
}

async function participantsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

async function loadParticipant(eventId: string, participantId: string) {
  return prisma.eventParticipant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true, archivedAt: true },
  });
}

async function normalizePrimary(participantId: string, contactId: string) {
  await prisma.eventParticipantContact.updateMany({
    where: { participantId, archivedAt: null, id: { not: contactId } },
    data: { isPrimary: false },
  });
}

async function promoteFallback(participantId: string) {
  const fallback = await prisma.eventParticipantContact.findFirst({
    where: { participantId, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (fallback) {
    await prisma.eventParticipantContact.update({ where: { id: fallback.id }, data: { isPrimary: true, contactType: "PRIMARY" } });
  }
}

router.get("/:eventId/participants/:participantId/contacts", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const contacts = await prisma.eventParticipantContact.findMany({
    where: { participantId: participant.id, archivedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return res.json({ contacts });
});

router.post("/:eventId/participants/:participantId/contacts", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing contacts." });

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const contact = await prisma.$transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx.eventParticipantContact.updateMany({
        where: { participantId: participant.id, archivedAt: null },
        data: { isPrimary: false },
      });
    }
    return tx.eventParticipantContact.create({
      data: {
        eventId: event.id,
        participantId: participant.id,
        ...parsed.data,
        contactType: parsed.data.isPrimary ? "PRIMARY" : parsed.data.contactType,
      },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.created",
    entityType: "EventParticipantContact",
    entityId: contact.id,
    metadata: { eventId: event.id, participantId: participant.id, isPrimary: contact.isPrimary },
  });
  return res.status(201).json({ contact });
});

router.patch("/:eventId/participants/:participantId/contacts/:contactId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing contacts." });

  const existing = await prisma.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id },
  });
  if (!existing) return res.status(404).json({ error: "Contact not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "Contact is archived. Restore it before editing." });

  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const contact = await prisma.$transaction(async (tx) => {
    const makePrimary = parsed.data.isPrimary === true;
    if (makePrimary) {
      await tx.eventParticipantContact.updateMany({
        where: { participantId: participant.id, archivedAt: null, id: { not: existing.id } },
        data: { isPrimary: false },
      });
    }
    const data = { ...parsed.data };
    if (makePrimary) data.contactType = "PRIMARY";
    return tx.eventParticipantContact.update({ where: { id: existing.id }, data });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.updated",
    entityType: "EventParticipantContact",
    entityId: contact.id,
    metadata: { eventId: event.id, participantId: participant.id, changedFields: Object.keys(parsed.data) },
  });
  return res.json({ contact });
});

router.delete("/:eventId/participants/:participantId/contacts/:contactId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const existing = await prisma.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id, archivedAt: null },
  });
  if (!existing) return res.status(404).json({ error: "Contact not found" });

  await prisma.$transaction(async (tx) => {
    await tx.eventParticipantContact.update({ where: { id: existing.id }, data: { archivedAt: new Date(), isPrimary: false } });
    if (existing.isPrimary) {
      const fallback = await tx.eventParticipantContact.findFirst({
        where: { participantId: participant.id, archivedAt: null, id: { not: existing.id } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (fallback) await tx.eventParticipantContact.update({ where: { id: fallback.id }, data: { isPrimary: true, contactType: "PRIMARY" } });
    }
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.archived",
    entityType: "EventParticipantContact",
    entityId: existing.id,
    metadata: { eventId: event.id, participantId: participant.id, wasPrimary: existing.isPrimary },
  });
  return res.status(204).send();
});

router.post("/:eventId/participants/:participantId/contacts/:contactId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing contacts." });

  const existing = await prisma.eventParticipantContact.findFirst({
    where: { id: req.params.contactId, participantId: participant.id, archivedAt: { not: null } },
  });
  if (!existing) return res.status(404).json({ error: "Archived contact not found" });

  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const restored = await prisma.$transaction(async (tx) => {
    const makePrimary = parsed.data.isPrimary === true;
    if (makePrimary) {
      await tx.eventParticipantContact.updateMany({
        where: { participantId: participant.id, archivedAt: null },
        data: { isPrimary: false },
      });
    }
    return tx.eventParticipantContact.update({
      where: { id: existing.id },
      data: { archivedAt: null, ...parsed.data, ...(makePrimary ? { contactType: "PRIMARY" } : {}) },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantContact.restored",
    entityType: "EventParticipantContact",
    entityId: restored.id,
    metadata: { eventId: event.id, participantId: participant.id, isPrimary: restored.isPrimary },
  });
  return res.json({ contact: restored });
});

export default router;
