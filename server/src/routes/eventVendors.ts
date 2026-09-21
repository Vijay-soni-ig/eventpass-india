import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const vendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(5000).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().url().max(500).optional(),
  photoUrl: z.string().trim().url().max(1000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isPublic: z.boolean().default(true),
});

const updateSchema = vendorSchema.partial();
const STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds } }, select: { id: true } });
}

async function vendorsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/vendors", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (status && !STATUSES.includes(status as typeof STATUSES[number])) return res.status(400).json({ error: "Invalid vendor status" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });
  const where = {
    eventId: event.id,
    participantType: "VENDOR" as const,
    ...(status ? { status: status as typeof STATUSES[number] } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { title: { contains: search, mode: "insensitive" as const } },
      { organization: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [vendors, total] = await Promise.all([
    prisma.eventParticipant.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.eventParticipant.count({ where }),
  ]);
  return res.json({ vendors, total, page, pageSize: limit });
});

router.post("/:eventId/vendors", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await vendorsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const parsed = vendorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const vendor = await prisma.eventParticipant.create({ data: { participantType: "VENDOR", ...parsed.data, eventId: event.id } });
  await logAudit({ actorUserId: req.user!.id, action: "eventVendor.created", entityType: "EventParticipant", entityId: vendor.id, metadata: { eventId: event.id } });
  return res.status(201).json({ vendor });
});

router.patch("/:eventId/vendors/:vendorId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await vendorsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.vendorId, eventId: event.id, participantType: "VENDOR" } });
  if (!existing) return res.status(404).json({ error: "Vendor not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "Vendor is archived. Restore it before editing." });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const vendor = await prisma.eventParticipant.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({ actorUserId: req.user!.id, action: "eventVendor.updated", entityType: "EventParticipant", entityId: vendor.id, metadata: { eventId: event.id, changedFields: Object.keys(parsed.data) } });
  return res.json({ vendor });
});

router.delete("/:eventId/vendors/:vendorId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await vendorsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.vendorId, eventId: event.id, participantType: "VENDOR" } });
  if (!existing) return res.status(404).json({ error: "Vendor not found" });
  if (existing.archivedAt) return res.status(204).send();
  const vendor = await prisma.eventParticipant.update({ where: { id: existing.id }, data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false } });
  await logAudit({ actorUserId: req.user!.id, action: "eventVendor.archived", entityType: "EventParticipant", entityId: vendor.id, metadata: { eventId: event.id } });
  return res.status(204).send();
});

router.post("/:eventId/vendors/:vendorId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await vendorsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.vendorId, eventId: event.id, participantType: "VENDOR" } });
  if (!existing) return res.status(404).json({ error: "Vendor not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "Vendor is not archived" });
  const vendor = await prisma.eventParticipant.update({ where: { id: existing.id }, data: { status: "ACTIVE", archivedAt: null } });
  await logAudit({ actorUserId: req.user!.id, action: "eventVendor.restored", entityType: "EventParticipant", entityId: vendor.id, metadata: { eventId: event.id } });
  return res.json({ vendor });
});

export default router;
