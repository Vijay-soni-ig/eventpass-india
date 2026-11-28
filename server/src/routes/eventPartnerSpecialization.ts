import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
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

const MODULE_DISABLED = "The PARTNERS module is not enabled for this event";

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts), matching partners/speakers/
// sponsors/staff.

router.get("/:eventId/partners/:partnerId/profile", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTNERS"))) return reply(409, { error: MODULE_DISABLED });
  const partner = await tx.eventParticipant.findFirst({
    where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    select: { id: true, archivedAt: true },
  });
  if (!partner) return reply(404, { error: "Partner not found" });
  if (partner.archivedAt) return reply(409, { error: "Partner is archived. Restore it before accessing the profile." });
  return reply(200, { profile: await tx.eventPartnerProfile.findUnique({ where: { participantId: partner.id } }) });
}));

router.put("/:eventId/partners/:partnerId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTNERS"))) return reply(409, { error: MODULE_DISABLED });
  const partner = await tx.eventParticipant.findFirst({
    where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    select: { id: true, archivedAt: true },
  });
  if (!partner) return reply(404, { error: "Partner not found" });
  if (partner.archivedAt) return reply(409, { error: "Partner is archived. Restore it before editing." });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  const profile = await tx.eventPartnerProfile.upsert({
    where: { participantId: partner.id },
    create: { eventId: event.id, participantId: partner.id, ...parsed.data },
    update: parsed.data,
  });
  return reply(200, { profile }, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventPartnerProfile.upserted",
    entityType: "EventPartnerProfile",
    entityId: profile.id,
    metadata: { eventId: event.id, partnerId: partner.id, changedFields: Object.keys(parsed.data) },
  }));
}));

export default router;
