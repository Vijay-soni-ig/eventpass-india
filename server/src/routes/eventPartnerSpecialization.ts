import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const profileSchema = z.object({
  partnerCategory: z.string().trim().max(150).nullable().optional(),
  relationshipSummary: z.string().trim().max(1000).nullable().optional(),
  contributionSummary: z.string().trim().max(2000).nullable().optional(),
  engagementModel: z.string().trim().max(150).nullable().optional(),
  displayLabel: z.string().trim().max(200).nullable().optional(),
  displayDescription: z.string().trim().max(3000).nullable().optional(),
  displayOrder: z.number().int().min(0).max(100000).default(0),
  showContact: z.boolean().default(false),
  showWebsite: z.boolean().default(true),
});

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const ids = await organizerIdsWithPermission(user, permission);
  if (!ids.length) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: ids } }, select: { id: true } });
}

async function enabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTNERS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/partners/:partnerId/profile", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await enabled(event.id))) return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });

  const partner = await prisma.eventParticipant.findFirst({
    where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    select: { id: true, archivedAt: true },
  });
  if (!partner) return res.status(404).json({ error: "Partner not found" });
  return res.json({ profile: await prisma.eventPartnerProfile.findUnique({ where: { participantId: partner.id } }) });
});

router.put("/:eventId/partners/:partnerId/profile", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await enabled(event.id))) return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });

  const partner = await prisma.eventParticipant.findFirst({
    where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    select: { id: true, archivedAt: true },
  });
  if (!partner) return res.status(404).json({ error: "Partner not found" });
  if (partner.archivedAt) return res.status(409).json({ error: "Partner is archived. Restore it before editing." });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const profile = await prisma.eventPartnerProfile.upsert({
    where: { participantId: partner.id },
    create: { eventId: event.id, participantId: partner.id, ...parsed.data },
    update: parsed.data,
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventPartnerProfile.upserted",
    entityType: "EventPartnerProfile",
    entityId: profile.id,
    metadata: { eventId: event.id, partnerId: partner.id, changedFields: Object.keys(parsed.data) },
  });

  return res.json({ profile });
});

export default router;
