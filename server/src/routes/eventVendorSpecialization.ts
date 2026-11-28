import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
import { logAudit } from "../lib/audit";
import { httpUrl } from "../lib/httpUrl";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(150).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
const updateSchema = serviceSchema.partial();
const profileSchema = z.object({
  contactName: z.string().trim().max(200).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
  contactPhone: z.string().trim().max(50).nullable().optional(),
  serviceArea: z.string().trim().max(500).nullable().optional(),
  operatingHours: z.string().trim().max(500).nullable().optional(),
  bookingNotes: z.string().trim().max(2000).nullable().optional(),
  displayWebsite: httpUrl(500).nullable().optional(),
  serviceIds: z.array(z.string().uuid()).max(50).default([]),
});

const MODULE_DISABLED = "The VENDORS module is not enabled for this event";
const DUPLICATE_SERVICE = "A vendor service with this name already exists";

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts).

router.get("/:eventId/vendor-services", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const sortDir = String(req.query.sortDir ?? "asc");
  if (status && !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) return reply(400, { error: "Invalid vendor service status" });
  if (sortDir !== "asc" && sortDir !== "desc") return reply(400, { error: "Invalid sortDir" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return reply(400, { error: "page must be >= 1 and limit must be 1-100" });
  const where = {
    eventId: event.id,
    ...(status ? { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { category: { contains: search, mode: "insensitive" as const } }] } : {}),
  };
  const [services, total] = await Promise.all([
    tx.eventVendorService.findMany({ where, orderBy: [{ sortOrder: sortDir as "asc" | "desc" }, { name: sortDir as "asc" | "desc" }], skip: (page - 1) * limit, take: limit }),
    tx.eventVendorService.count({ where }),
  ]);
  return reply(200, { services, total, page, pageSize: limit });
}));

router.post("/:eventId/vendor-services", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const p = serviceSchema.safeParse(req.body);
  if (!p.success) return reply(400, { error: p.error.issues[0].message });
  // A unique-violation aborts the Postgres transaction, so detect the duplicate
  // up front (safe: the organizer lock serializes writers) instead of catching
  // P2002 mid-transaction.
  const duplicate = await tx.eventVendorService.findFirst({ where: { eventId: event.id, name: p.data.name }, select: { id: true } });
  if (duplicate) return reply(409, { error: DUPLICATE_SERVICE });
  const service = await tx.eventVendorService.create({ data: { eventId: event.id, ...p.data } });
  return reply(201, { service }, () => logAudit({ actorUserId: req.user!.id, action: "eventVendorService.created", entityType: "EventVendorService", entityId: service.id, metadata: { eventId: event.id } }));
}));

router.patch("/:eventId/vendor-services/:serviceId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const existing = await tx.eventVendorService.findFirst({ where: { id: req.params.serviceId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Vendor service not found" });
  const p = updateSchema.safeParse(req.body);
  if (!p.success) return reply(400, { error: p.error.issues[0].message });
  if (p.data.name !== undefined) {
    const duplicate = await tx.eventVendorService.findFirst({ where: { eventId: event.id, name: p.data.name, id: { not: existing.id } }, select: { id: true } });
    if (duplicate) return reply(409, { error: DUPLICATE_SERVICE });
  }
  const service = await tx.eventVendorService.update({ where: { id: existing.id }, data: p.data });
  return reply(200, { service }, () => logAudit({ actorUserId: req.user!.id, action: "eventVendorService.updated", entityType: "EventVendorService", entityId: service.id, metadata: { eventId: event.id, changedFields: Object.keys(p.data) } }));
}));

router.delete("/:eventId/vendor-services/:serviceId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const service = await tx.eventVendorService.findFirst({ where: { id: req.params.serviceId, eventId: event.id } });
  if (!service) return reply(404, { error: "Vendor service not found" });
  if (service.status === "ARCHIVED") return reply(204);
  await tx.eventVendorService.update({ where: { id: service.id }, data: { status: "ARCHIVED" } });
  return reply(204, undefined, () => logAudit({ actorUserId: req.user!.id, action: "eventVendorService.archived", entityType: "EventVendorService", entityId: service.id, metadata: { eventId: event.id } }));
}));

router.post("/:eventId/vendor-services/:serviceId/restore", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const service = await tx.eventVendorService.findFirst({ where: { id: req.params.serviceId, eventId: event.id } });
  if (!service) return reply(404, { error: "Vendor service not found" });
  if (service.status !== "ARCHIVED") return reply(400, { error: "Vendor service is not archived" });
  const restored = await tx.eventVendorService.update({ where: { id: service.id }, data: { status: "ACTIVE" } });
  return reply(200, { service: restored }, () => logAudit({ actorUserId: req.user!.id, action: "eventVendorService.restored", entityType: "EventVendorService", entityId: restored.id, metadata: { eventId: event.id } }));
}));

router.get("/:eventId/vendors/:vendorId/profile", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const vendor = await tx.eventParticipant.findFirst({ where: { id: req.params.vendorId, eventId: event.id, participantType: "VENDOR" }, select: { id: true, archivedAt: true } });
  if (!vendor) return reply(404, { error: "Vendor not found" });
  if (vendor.archivedAt) return reply(409, { error: "Vendor is archived. Restore it before accessing the profile." });
  const profile = await tx.eventVendorProfile.findUnique({ where: { participantId: vendor.id }, include: { services: { include: { service: true }, orderBy: { sortOrder: "asc" } } } });
  return reply(200, { profile });
}));

router.put("/:eventId/vendors/:vendorId/profile", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "VENDORS"))) return reply(409, { error: MODULE_DISABLED });
  const vendor = await tx.eventParticipant.findFirst({ where: { id: req.params.vendorId, eventId: event.id, participantType: "VENDOR" }, select: { id: true, archivedAt: true } });
  if (!vendor) return reply(404, { error: "Vendor not found" });
  if (vendor.archivedAt) return reply(409, { error: "Vendor is archived. Restore it before editing." });
  const p = profileSchema.safeParse(req.body);
  if (!p.success) return reply(400, { error: p.error.issues[0].message });
  const uniqueIds = [...new Set(p.data.serviceIds)];
  const services = await tx.eventVendorService.findMany({ where: { id: { in: uniqueIds }, eventId: event.id, status: "ACTIVE" }, select: { id: true } });
  if (services.length !== uniqueIds.length) return reply(400, { error: "All serviceIds must reference active services belonging to this event" });
  const { serviceIds: _serviceIds, ...profileData } = p.data;
  const up = await tx.eventVendorProfile.upsert({
    where: { participantId: vendor.id },
    create: { eventId: event.id, participantId: vendor.id, ...profileData },
    update: profileData,
  });
  await tx.eventVendorProfileService.deleteMany({ where: { profileId: up.id } });
  if (uniqueIds.length) await tx.eventVendorProfileService.createMany({ data: uniqueIds.map((serviceId, i) => ({ profileId: up.id, serviceId, sortOrder: i })) });
  const profile = await tx.eventVendorProfile.findUnique({ where: { id: up.id }, include: { services: { include: { service: true }, orderBy: { sortOrder: "asc" } } } });
  if (!profile) return reply(500, { error: "Vendor profile could not be loaded after update" });
  return reply(200, { profile }, () => logAudit({ actorUserId: req.user!.id, action: "eventVendorProfile.upserted", entityType: "EventVendorProfile", entityId: profile.id, metadata: { eventId: event.id, vendorId: vendor.id, serviceIds: uniqueIds } }));
}));

export default router;
