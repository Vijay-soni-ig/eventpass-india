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
  packageId: z.string().uuid().nullable().optional(),
  amountOverride: z.number().finite().min(0).max(100000000).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  benefitsOverride: z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
  deliverablesOverride: z.array(z.string().trim().min(1).max(500)).max(50).nullable().optional(),
  logoUrl: z.string().trim().url().max(1000).nullable().optional(),
  brandPrimaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  brandSecondaryColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  displayWebsite: z.string().trim().url().max(500).nullable().optional(),
});
type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds } }, select: { id: true } });
}
async function sponsorsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({ where: { eventId_moduleType: { eventId, moduleType: "SPONSORS" } }, select: { enabled: true } });
  return row?.enabled === true;
}

async function loadSponsor(eventId: string, sponsorId: string) {
  return prisma.eventParticipant.findFirst({ where: { id: sponsorId, eventId, participantType: "SPONSOR" }, select: { id: true, archivedAt: true } });
}

router.get("/:eventId/sponsors/:sponsorId/profile", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const sponsor = await loadSponsor(event.id, req.params.sponsorId);
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  const profile = await prisma.eventSponsorProfile.findUnique({ where: { participantId: sponsor.id }, include: { package: true } });
  return res.json({ profile });
});

router.put("/:eventId/sponsors/:sponsorId/profile", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const sponsor = await loadSponsor(event.id, req.params.sponsorId);
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  if (sponsor.archivedAt) return res.status(409).json({ error: "Sponsor is archived. Restore it before editing." });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;

  if (data.packageId) {
    const sponsorPackage = await prisma.eventSponsorPackage.findFirst({ where: { id: data.packageId, eventId: event.id } });
    if (!sponsorPackage) return res.status(400).json({ error: "packageId must reference a package belonging to this event" });
    if (sponsorPackage.status !== "ACTIVE") return res.status(409).json({ error: "Only active sponsor packages can be assigned" });
  }

  const profile = await prisma.eventSponsorProfile.upsert({
    where: { participantId: sponsor.id },
    create: { eventId: event.id, participantId: sponsor.id, ...data },
    update: data,
    include: { package: true },
  });
  await logAudit({ actorUserId: req.user!.id, action: "eventSponsorProfile.upserted", entityType: "EventSponsorProfile", entityId: profile.id, metadata: { eventId: event.id, sponsorId: sponsor.id, packageId: data.packageId ?? null, changedFields: Object.keys(data) } });
  return res.json({ profile });
});

export default router;
