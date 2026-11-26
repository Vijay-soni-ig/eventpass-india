import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
import { logAudit } from "../lib/audit";
import { httpUrl } from "../lib/httpUrl";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const partnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(5000).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  website: httpUrl(500).optional(),
  photoUrl: httpUrl(1000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isPublic: z.boolean().default(true),
});

const updateSchema = partnerSchema.extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).partial();
const STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

async function partnersEnabled(tx: Prisma.TransactionClient, eventId: string) {
  const row = await tx.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTNERS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/partners", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!(await partnersEnabled(tx, event.id))) return { kind: "module_disabled" as const };

    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 50);
    const sortBy = String(req.query.sortBy ?? "sortOrder");
    const sortDir = String(req.query.sortDir ?? "asc");
    const allowedSorts = ["sortOrder", "name", "organization", "createdAt"] as const;
    if (!allowedSorts.includes(sortBy as typeof allowedSorts[number])) {
      return { kind: "bad_request" as const, error: "Invalid sortBy" };
    }
    if (sortDir !== "asc" && sortDir !== "desc") {
      return { kind: "bad_request" as const, error: "Invalid sortDir" };
    }
    if (status && !STATUSES.includes(status as typeof STATUSES[number])) {
      return { kind: "bad_request" as const, error: "Invalid partner status" };
    }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { kind: "bad_request" as const, error: "page must be >= 1 and limit must be 1-100" };
    }

    const where = {
      eventId: event.id,
      participantType: "PARTNER" as const,
      ...(status
        ? { status: status as typeof STATUSES[number] }
        : { status: { not: "ARCHIVED" as const } }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { title: { contains: search, mode: "insensitive" as const } },
              { organization: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [partners, total] = await Promise.all([
      tx.eventParticipant.findMany({
        where,
        orderBy: [{ [sortBy]: sortDir as "asc" | "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.eventParticipant.count({ where }),
    ]);
    return { kind: "ok" as const, partners, total, page, pageSize: limit };
  });

  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });
  }
  if (result.kind === "bad_request") return res.status(400).json({ error: result.error });
  return res.json({ partners: result.partners, total: result.total, page: result.page, pageSize: result.pageSize });
});

router.post("/:eventId/partners", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await partnersEnabled(tx, event.id))) return { kind: "module_disabled" as const };
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) return { kind: "bad_request" as const, error: parsed.error.issues[0].message };
    const partner = await tx.eventParticipant.create({
      data: { participantType: "PARTNER", ...parsed.data, eventId: event.id },
    });
    return { kind: "created" as const, partner, eventId: event.id };
  });

  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });
  }
  if (result.kind === "bad_request") return res.status(400).json({ error: result.error });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventPartner.created",
    entityType: "EventParticipant",
    entityId: result.partner.id,
    metadata: { eventId: result.eventId },
  });
  return res.status(201).json({ partner: result.partner });
});

router.patch("/:eventId/partners/:partnerId", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await partnersEnabled(tx, event.id))) return { kind: "module_disabled" as const };
    const existing = await tx.eventParticipant.findFirst({
      where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    });
    if (!existing) return { kind: "not_found" as const };
    if (existing.archivedAt) return { kind: "conflict" as const, error: "Partner is archived. Restore it before editing." };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return { kind: "bad_request" as const, error: parsed.error.issues[0].message };
    const partner = await tx.eventParticipant.update({ where: { id: existing.id }, data: parsed.data });
    return {
      kind: "updated" as const,
      partner,
      eventId: event.id,
      changedFields: Object.keys(parsed.data),
    };
  });

  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });
  }
  if (result.kind === "not_found") return res.status(404).json({ error: "Partner not found" });
  if (result.kind === "conflict") return res.status(409).json({ error: result.error });
  if (result.kind === "bad_request") return res.status(400).json({ error: result.error });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventPartner.updated",
    entityType: "EventParticipant",
    entityId: result.partner.id,
    metadata: { eventId: result.eventId, changedFields: result.changedFields },
  });
  return res.json({ partner: result.partner });
});

router.delete("/:eventId/partners/:partnerId", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await partnersEnabled(tx, event.id))) return { kind: "module_disabled" as const };
    const existing = await tx.eventParticipant.findFirst({
      where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    });
    if (!existing) return { kind: "not_found" as const };
    if (existing.archivedAt) return { kind: "already_archived" as const };
    const partner = await tx.eventParticipant.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false },
    });
    return { kind: "archived" as const, partner, eventId: event.id };
  });

  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });
  }
  if (result.kind === "not_found") return res.status(404).json({ error: "Partner not found" });
  if (result.kind === "already_archived") return res.status(204).send();
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventPartner.archived",
    entityType: "EventParticipant",
    entityId: result.partner.id,
    metadata: { eventId: result.eventId },
  });
  return res.status(204).send();
});

router.post("/:eventId/partners/:partnerId/restore", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await partnersEnabled(tx, event.id))) return { kind: "module_disabled" as const };
    const existing = await tx.eventParticipant.findFirst({
      where: { id: req.params.partnerId, eventId: event.id, participantType: "PARTNER" },
    });
    if (!existing) return { kind: "not_found" as const };
    if (!existing.archivedAt) return { kind: "not_archived" as const };
    const partner = await tx.eventParticipant.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", archivedAt: null },
    });
    return { kind: "restored" as const, partner, eventId: event.id };
  });

  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "The PARTNERS module is not enabled for this event" });
  }
  if (result.kind === "not_found") return res.status(404).json({ error: "Partner not found" });
  if (result.kind === "not_archived") return res.status(400).json({ error: "Partner is not archived" });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventPartner.restored",
    entityType: "EventParticipant",
    entityId: result.partner.id,
    metadata: { eventId: result.eventId },
  });
  return res.json({ partner: result.partner });
});

export default router;
