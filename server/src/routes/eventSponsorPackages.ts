import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
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

const MODULE_DISABLED = "The SPONSORS module is not enabled for this event";
const DUPLICATE_PACKAGE = "A sponsor package with this name already exists for the event";

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts).

router.get("/:eventId/sponsor-packages", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  if (status && !["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) return reply(400, { error: "Invalid package status" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return reply(400, { error: "page must be >= 1 and limit must be 1-100" });

  const where = {
    eventId: event.id,
    ...(status ? { status: status as "ACTIVE" | "INACTIVE" | "ARCHIVED" } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [packages, total] = await Promise.all([
    tx.eventSponsorPackage.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], skip: (page - 1) * limit, take: limit }),
    tx.eventSponsorPackage.count({ where }),
  ]);
  return reply(200, { packages, total, page, pageSize: limit });
}));

router.post("/:eventId/sponsor-packages", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  // A unique violation aborts the Postgres transaction, so detect the duplicate
  // up front (safe: the organizer lock serializes writers for this Event).
  const duplicate = await tx.eventSponsorPackage.findFirst({ where: { eventId: event.id, name: parsed.data.name }, select: { id: true } });
  if (duplicate) return reply(409, { error: DUPLICATE_PACKAGE });
  const sponsorPackage = await tx.eventSponsorPackage.create({ data: { ...parsed.data, eventId: event.id } });
  return reply(201, { package: sponsorPackage }, () => logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.created", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } }));
}));

router.patch("/:eventId/sponsor-packages/:packageId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const existing = await tx.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Sponsor package not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  if (parsed.data.name !== undefined) {
    const duplicate = await tx.eventSponsorPackage.findFirst({ where: { eventId: event.id, name: parsed.data.name, id: { not: existing.id } }, select: { id: true } });
    if (duplicate) return reply(409, { error: DUPLICATE_PACKAGE });
  }
  const sponsorPackage = await tx.eventSponsorPackage.update({ where: { id: existing.id }, data: parsed.data });
  return reply(200, { package: sponsorPackage }, () => logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.updated", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id, changedFields: Object.keys(parsed.data) } }));
}));

router.delete("/:eventId/sponsor-packages/:packageId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const existing = await tx.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Sponsor package not found" });
  if (existing.status === "ARCHIVED") return reply(204);
  const sponsorPackage = await tx.eventSponsorPackage.update({ where: { id: existing.id }, data: { status: "ARCHIVED" } });
  return reply(204, undefined, () => logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.archived", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } }));
}));

router.post("/:eventId/sponsor-packages/:packageId/restore", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "SPONSORS"))) return reply(409, { error: MODULE_DISABLED });
  const existing = await tx.eventSponsorPackage.findFirst({ where: { id: req.params.packageId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Sponsor package not found" });
  if (existing.status !== "ARCHIVED") return reply(400, { error: "Sponsor package is not archived" });
  const sponsorPackage = await tx.eventSponsorPackage.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
  return reply(200, { package: sponsorPackage }, () => logAudit({ actorUserId: req.user!.id, action: "eventSponsorPackage.restored", entityType: "EventSponsorPackage", entityId: sponsorPackage.id, metadata: { eventId: event.id } }));
}));

export default router;
