import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must use HH:mm");
const profileFields = {
  department: z.string().trim().max(150).optional(),
  assignmentArea: z.string().trim().max(300).optional(),
  roleDescription: z.string().trim().max(500).optional(),
  availability: z.enum(["AVAILABLE", "ON_LEAVE", "UNAVAILABLE", "ON_CALL"]).default("AVAILABLE"),
  availabilityNote: z.string().trim().max(500).optional(),
  shiftStart: timeSchema.optional(),
  shiftEnd: timeSchema.optional(),
  operationalNotes: z.string().trim().max(2000).optional(),
  displayOrder: z.number().int().min(0).max(100000).default(0),
};
const profileSchema = z.object(profileFields).superRefine((value, ctx) => {
  if (value.shiftStart !== undefined && value.shiftEnd !== undefined && value.shiftStart >= value.shiftEnd) {
    ctx.addIssue({ code: "custom", path: ["shiftEnd"], message: "shiftEnd must be after shiftStart" });
  }
});
const updateSchema = z.object(profileFields).partial().superRefine((value, ctx) => {
  if (value.shiftStart !== undefined && value.shiftEnd !== undefined && value.shiftStart >= value.shiftEnd) {
    ctx.addIssue({ code: "custom", path: ["shiftEnd"], message: "shiftEnd must be after shiftStart" });
  }
});

const MODULE_DISABLED = "The PARTICIPANTS module is not enabled for this event";

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts).

router.get("/:eventId/staff/:staffId/profile", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const staff = await tx.eventParticipant.findFirst({ where: { id: req.params.staffId, eventId: event.id, participantType: "STAFF" }, select: { id: true, archivedAt: true } });
  if (!staff) return reply(404, { error: "Staff member not found" });
  if (staff.archivedAt) return reply(409, { error: "Staff member is archived. Restore it before accessing the profile." });
  const profile = await tx.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  return reply(200, { profile });
}));

router.put("/:eventId/staff/:staffId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const staff = await tx.eventParticipant.findFirst({ where: { id: req.params.staffId, eventId: event.id, participantType: "STAFF" }, select: { id: true, archivedAt: true } });
  if (!staff) return reply(404, { error: "Staff member not found" });
  if (staff.archivedAt) return reply(409, { error: "Staff member is archived. Restore it before editing." });
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const profile = await tx.eventStaffProfile.upsert({
    where: { participantId: staff.id },
    create: { eventId: event.id, participantId: staff.id, ...parsed.data },
    update: parsed.data,
  });
  return reply(200, { profile }, () => logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.upserted", entityType: "EventStaffProfile", entityId: profile.id, metadata: { eventId: event.id, staffId: staff.id } }));
}));

router.patch("/:eventId/staff/:staffId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const staff = await tx.eventParticipant.findFirst({ where: { id: req.params.staffId, eventId: event.id, participantType: "STAFF" }, select: { id: true, archivedAt: true } });
  if (!staff) return reply(404, { error: "Staff member not found" });
  if (staff.archivedAt) return reply(409, { error: "Staff member is archived. Restore it before editing." });
  const existing = await tx.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  if (!existing) return reply(404, { error: "Staff profile not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const profile = await tx.eventStaffProfile.update({ where: { id: existing.id }, data: parsed.data });
  return reply(200, { profile }, () => logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.updated", entityType: "EventStaffProfile", entityId: profile.id, metadata: { eventId: event.id, staffId: staff.id, changedFields: Object.keys(parsed.data) } }));
}));

router.delete("/:eventId/staff/:staffId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });
  const staff = await tx.eventParticipant.findFirst({ where: { id: req.params.staffId, eventId: event.id, participantType: "STAFF" }, select: { id: true, archivedAt: true } });
  if (!staff) return reply(404, { error: "Staff member not found" });
  const existing = await tx.eventStaffProfile.findUnique({ where: { participantId: staff.id } });
  if (!existing) return reply(204);
  await tx.eventStaffProfile.delete({ where: { id: existing.id } });
  return reply(204, undefined, () => logAudit({ actorUserId: req.user!.id, action: "eventStaffProfile.deleted", entityType: "EventStaffProfile", entityId: existing.id, metadata: { eventId: event.id, staffId: staff.id } }));
}));

export default router;
