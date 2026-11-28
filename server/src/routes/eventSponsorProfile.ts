import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
import { logAudit } from "../lib/audit";
import { httpUrl } from "../lib/httpUrl";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const profileSchema = z.object({
  packageId: z.string().uuid().nullable().optional(),
  amountOverride: z.number().finite().min(0).max(100000000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  benefitsOverride: z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
  deliverablesOverride: z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
  logoUrl: httpUrl(1000).nullable().optional(),
  brandPrimaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  brandSecondaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  displayWebsite: httpUrl(500).nullable().optional(),
});
const MODULE_DISABLED = "The SPONSORS module is not enabled for this event";

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts).

router.get("/:eventId/sponsors/:sponsorId/profile", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const sponsor = await tx.eventParticipant.findFirst({ where: { id: req.params.sponsorId, eventId: event.id, participantType: "SPONSOR" }, select: { id: true, archivedAt: true } });
  if (!sponsor) return reply(404, { error: "Sponsor not found" });
  if (sponsor.archivedAt) return reply(409, { error: "Sponsor is archived. Restore it before accessing the profile." });
  const profile = await tx.eventSponsorProfile.findUnique({ where: { participantId: sponsor.id }, include: { package: true } });
  return reply(200, { profile });
}));

router.put("/:eventId/sponsors/:sponsorId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const sponsor = await tx.eventParticipant.findFirst({ where: { id: req.params.sponsorId, eventId: event.id, participantType: "SPONSOR" }, select: { id: true, archivedAt: true } });
  if (!sponsor) return reply(404, { error: "Sponsor not found" });
  if (sponsor.archivedAt) return reply(409, { error: "Sponsor is archived. Restore it before editing." });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const data = parsed.data;

  if (data.packageId) {
    const sponsorPackage = await tx.eventSponsorPackage.findFirst({ where: { id: data.packageId, eventId: event.id } });
    if (!sponsorPackage) return reply(400, { error: "packageId must reference a package belonging to this event" });
    if (sponsorPackage.status !== "ACTIVE") return reply(409, { error: "Only active sponsor packages can be assigned" });
  }

  const dbData: Prisma.EventSponsorProfileUncheckedCreateInput = {
    eventId: event.id,
    participantId: sponsor.id,
    ...(data.packageId !== undefined ? { packageId: data.packageId } : {}),
    ...(data.amountOverride !== undefined ? { amountOverride: data.amountOverride } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.benefitsOverride !== undefined ? { benefitsOverride: data.benefitsOverride ?? Prisma.JsonNull } : {}),
    ...(data.deliverablesOverride !== undefined ? { deliverablesOverride: data.deliverablesOverride ?? Prisma.JsonNull } : {}),
    ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
    ...(data.brandPrimaryColor !== undefined ? { brandPrimaryColor: data.brandPrimaryColor } : {}),
    ...(data.brandSecondaryColor !== undefined ? { brandSecondaryColor: data.brandSecondaryColor } : {}),
    ...(data.displayWebsite !== undefined ? { displayWebsite: data.displayWebsite } : {}),
  };

  const profile = await tx.eventSponsorProfile.upsert({
    where: { participantId: sponsor.id },
    create: dbData,
    update: dbData,
    include: { package: true },
  });
  return reply(200, { profile }, () => logAudit({ actorUserId: req.user!.id, action: "eventSponsorProfile.upserted", entityType: "EventSponsorProfile", entityId: profile.id, metadata: { eventId: event.id, sponsorId: sponsor.id, packageId: data.packageId ?? null, changedFields: Object.keys(data) } }));
}));

export default router;
