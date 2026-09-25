import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const packageSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).optional(),
  amount: z.number().finite().min(0).max(100000000).default(0),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("INR"),
  benefits: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  deliverables: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
const updateSchema = z.object({
  name: packageSchema.shape.name.optional(),
  description: packageSchema.shape.description,
  amount: packageSchema.shape.amount.optional(),
  currency: packageSchema.shape.currency.optional(),
  benefits: packageSchema.shape.benefits.optional(),
  deliverables: packageSchema.shape.deliverables.optional(),
  sortOrder: packageSchema.shape.sortOrder.optional(),
  status: packageSchema.shape.status.optional(),
});
type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds } }, select: { id: true } });
}

async function sponsorsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "SPONSORS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/sponsor-packages", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (status && !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) return res.status(400).json({ error: "Invalid package status" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });

  const where = {
    eventId: event.id,
    ...(status ? { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [packages, total] = await Promise.all([
    prisma.eventSponsorPackage.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.eventSponsorPackage.count({ where }),
  ]);
  return res.json({ packages, total, page, pageSize: limit });
});

router.post("/:eventId/sponsor-packages", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const sponsorPackage = await prisma.eventSponsorPackage.create({ data: { ...parsed.data, eventId: event.id } });
    await logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.created", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } });
    return res.status(201).json({ package: sponsorPackage });
  } catch (error) {
    if (error instanceof Error && error.message.includes("event_sponsor_packages_eventId_name_key")) return res.status(409).json({ error: "A sponsor package with this name already exists for the event" });
    throw error;
  }
});

router.patch("/:eventId/sponsor-packages/:packageId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const existing = await prisma.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Sponsor package not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const sponsorPackage = await prisma.eventSponsorPackage.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.updated", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id, changedFields: Object.keys(parsed.data) } });
  return res.json({ package: sponsorPackage });
});

router.delete("/:eventId/sponsor-packages/:packageId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const existing = await prisma.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Sponsor package not found" });
  if (existing.status === "ARCHIVED") return res.status(204).send();
  const sponsorPackage = await prisma.eventSponsorPackage.update({ where: { id: existing.id }, data: { status: "ARCHIVED" } });
  await logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.archived", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } });
  return res.status(204).send();
});

router.post("/:eventId/sponsor-packages/:packageId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sponsorsEnabled(event.id))) return res.status(409).json({ error: "The SPONSORS module is not enabled for this event" });
  const existing = await prisma.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Sponsor package not found" });
  if (existing.status !== "ARCHIVED") return res.status(400).json({ error: "Sponsor package is not archived" });
  const sponsorPackage = await prisma.eventSponsorPackage.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
  await logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.restored", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } });
  return res.json({ package: sponsorPackage });
});

export default router;
