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
  department: z.string().trim().max(150).optional(),
  assignmentArea: z.string().trim().max(300).optional(),
  roleDescription: z.string().trim().max(500).optional(),
  availability: z.enum(["AVAILABLE", "ON_LEAVE", "UNAVAILABLE", "ON_CALL"]).default("AVAILABLE"),
  availabilityNote: z.string().trim().max(500).optional(),
  shiftStart: z.string().trim().max(20).optional(),
  shiftEnd: z.string().trim().max(20).optional(),
  operationalNotes: z.string().trim().max(2000).optional(),
  displayOrder: z.number().int().min(0).max(100000).default(0),
});
const updateSchema = profileSchema.partial();
type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds } }, select: { id: true } });
}
async function staffEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({ where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } }, select: { enabled: true } });
  return row?.enabled === true;
}
async function loadStaff(eventId: string, staffId: string) {
  return prisma.eventParticipant.findFirst({ where: { id: staffId, eventId, participantType: "STAFF" }, select: { id: true, archivedAt: true } });
}

router.get("/:eventId/staff/:staffId/profile", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await staffEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const staff = await loadStaff(event.id, req.params.staffId);
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  const profile = await prisma.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  return res.json({ profile });
});

router.put("/:eventId/staff/:staffId/profile", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await staffEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const staff = await loadStaff(event.id, req.params.staffId);
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  if (staff.archivedAt) return res.status(409).json({ error: "Staff member is archived. Restore it before editing." });
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const profile = await prisma.eventStaffProfile.upsert({
    where: { participantId: staff.id },
    create: { eventId: event.id, participantId: staff.id, ...parsed.data },
    update: parsed.data,
  });
  await logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.upserted", entityType: "EventStaffProfile", entityId: profile.id, metadata: { eventId: event.id, staffId: staff.id } });
  return res.json({ profile });
});

router.patch("/:eventId/staff/:staffId/profile", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await staffEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const staff = await loadStaff(event.id, req.params.staffId);
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  if (staff.archivedAt) return res.status(409).json({ error: "Staff member is archived. Restore it before editing." });
  const existing = await prisma.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  if (!existing) return res.status(404).json({ error: "Staff profile not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const profile = await prisma.eventStaffProfile.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.updated", entityType: "EventStaffProfile", entityId: profile.id, metadata: { eventId: event.id, staffId: staff.id, changedFields: Object.keys(parsed.data) } });
  return res.json({ profile });
});

router.delete("/:eventId/staff/:staffId/profile", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await staffEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const staff = await loadStaff(event.id, req.params.staffId);
  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  const existing = await prisma.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  if (!existing) return res.status(204).send();
  await prisma.eventStaffProfile.delete({ where: { id: existing.id } });
  await logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.deleted", entityType: "EventStaffProfile", entityId: existing.id, metadata: { eventId: event.id, staffId: staff.id } });
  return res.status(204).send();
});

export default router;
