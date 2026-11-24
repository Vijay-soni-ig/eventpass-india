import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { hasAnyExhibitorMembership, isPlatformAdmin, organizerIdsWithPermission } from "../lib/access";
import { can, exhibitorRoleToRole, organizerRoleToRole } from "../lib/permissions";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { lockOrganizerForEntitlement } from "../lib/entitlementService";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
import { eventMutationRateLimit, exhibitorParticipationMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);
type AuthUser = Parameters<typeof isPlatformAdmin>[0];
const applySchema = z.object({ eventId: z.string().min(1), applicationNote: z.string().trim().max(2000).optional() });
const reviewSchema = z.object({ status: z.enum(["CONFIRMED", "REJECTED"]), reviewNote: z.string().trim().max(2000).optional() });

async function memberBusinessIds(user: AuthUser, permission: "eventExhibitor:manage" | "eventExhibitor:view", includeSuspended = false) {
  const memberships = await prisma.exhibitorMembership.findMany({
    where: { userId: user.id, status: "active", ...(includeSuspended ? {} : { business: { suspended: false } }) },
    select: { exhibitorBusinessId: true, role: true },
  });
  return memberships.filter((membership) => can(exhibitorRoleToRole(membership.role), permission)).map((membership) => membership.exhibitorBusinessId);
}

async function resolveBusiness(user: AuthUser, requested?: string) {
  const ids = await memberBusinessIds(user, "eventExhibitor:manage");
  if (ids.length || requested) {
    const selected = resolveActiveBusinessSelection(ids, requested);
    if ("status" in selected) return { error: selected } as const;
    if (!selected.businessId) return { error: { status: 403 as const, error: "No manageable exhibitor business" } } as const;
    return { id: selected.businessId } as const;
  }
  if (await hasAnyExhibitorMembership(user.id)) return { error: { status: 403 as const, error: "No permission to apply for this exhibitor business" } } as const;
  if (user.userType !== "exhibitor") return { error: { status: 403 as const, error: "An exhibitor account is required to apply" } } as const;
  return { id: await resolveExhibitorBusinessId(user.id) } as const;
}

async function lockBusinessPermission(tx: Prisma.TransactionClient, user: AuthUser, businessId: string, permission: "eventExhibitor:manage" | "eventExhibitor:view", allowSuspended = false) {
  const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "exhibitor_businesses" WHERE "id" = $1 FOR UPDATE', businessId);
  if (!rows.length) return false;
  const business = await tx.exhibitorBusiness.findUnique({ where: { id: businessId }, select: { suspended: true } });
  if (!business) return false;
  if (business.suspended && permission === "eventExhibitor:manage" && !allowSuspended) return false;
  const membership = await tx.exhibitorMembership.findFirst({
    where: {
      userId: user.id,
      exhibitorBusinessId: businessId,
      status: "active",
      ...(permission === "eventExhibitor:view" || allowSuspended ? {} : { business: { suspended: false } }),
    },
    select: { role: true },
  });
  return !!membership && can(exhibitorRoleToRole(membership.role), permission);
}

router.post("/", exhibitorParticipationMutationRateLimit, async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid application" });
  const event = await prisma.event.findFirst({
    where: { id: parsed.data.eventId, status: "PUBLISHED", visibility: "public", archivedAt: null, eventType: { not: "EXHIBITION" }, exhibition: { is: null },
      moduleEnablements: { some: { moduleType: "EXHIBITORS", enabled: true } } },
    select: { id: true, organizerId: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found or exhibitor applications unavailable" });
  const selected = await resolveBusiness(req.user!, req.get("X-Exhibitor-Business-Id")?.trim() || undefined);
  if (!("id" in selected)) return res.status(selected.error.status).json({ error: selected.error.error });

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!await lockBusinessPermission(tx, req.user!, selected.id, "eventExhibitor:manage")) return { kind: "forbidden" as const };
      await lockOrganizerForEntitlement(tx, event.organizerId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "events" WHERE "id" = $1 FOR UPDATE', event.id);
      const currentEvent = await tx.event.findFirst({
        where: { id: event.id, organizerId: event.organizerId, status: "PUBLISHED", visibility: "public", archivedAt: null,
          exhibition: { is: null }, moduleEnablements: { some: { moduleType: "EXHIBITORS", enabled: true } } },
        select: { id: true },
      });
      if (!currentEvent) return { kind: "unavailable" as const };
      const existing = await tx.eventExhibitorParticipation.findUnique({
        where: { eventId_exhibitorBusinessId: { eventId: event.id, exhibitorBusinessId: selected.id } },
      });
      if (existing) return { kind: "existing" as const, participation: existing };
      const participation = await tx.eventExhibitorParticipation.create({
        data: { eventId: event.id, exhibitorBusinessId: selected.id, applicationNote: parsed.data.applicationNote || null },
      });
      return { kind: "created" as const, participation };
    });
    if (result.kind === "forbidden") return res.status(403).json({ error: "Exhibitor access changed. Refresh and retry." });
    if (result.kind === "unavailable") return res.status(404).json({ error: "Event not found or exhibitor applications unavailable" });
    if (result.kind === "existing") {
      if (["APPLIED", "CONFIRMED"].includes(result.participation.status)) return res.status(200).json({ participation: result.participation, duplicate: true });
      return res.status(409).json({ error: "An application already exists with status " + result.participation.status });
    }
    await logAudit({ actorUserId: req.user!.id, action: "event_exhibitor_participation.applied", entityType: "EventExhibitorParticipation",
      entityId: result.participation.id, metadata: { eventId: event.id, exhibitorBusinessId: selected.id } });
    return res.status(201).json({ participation: result.participation, duplicate: false });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.eventExhibitorParticipation.findUnique({
        where: { eventId_exhibitorBusinessId: { eventId: event.id, exhibitorBusinessId: selected.id } },
      });
      if (existing && ["APPLIED", "CONFIRMED"].includes(existing.status)) return res.status(200).json({ participation: existing, duplicate: true });
      if (existing) return res.status(409).json({ error: "An application already exists with status " + existing.status });
    }
    throw error;
  }
});

router.get("/mine", async (req, res) => {
  const candidates = await memberBusinessIds(req.user!, "eventExhibitor:view", true);
  if (!candidates.length) return res.json({ participations: [] });
  const participations = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const id of [...candidates].sort()) if (await lockBusinessPermission(tx, req.user!, id, "eventExhibitor:view")) ids.push(id);
    return ids.length ? tx.eventExhibitorParticipation.findMany({
      where: { exhibitorBusinessId: { in: ids } },
      include: { event: { select: { id: true, title: true, status: true, visibility: true, startDate: true, endDate: true, city: true,
        organizer: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
    }) : [];
  });
  return res.json({ participations });
});

router.patch("/:id/withdraw", exhibitorParticipationMutationRateLimit, async (req, res) => {
  const ids = await memberBusinessIds(req.user!, "eventExhibitor:manage", true);
  const candidate = ids.length ? await prisma.eventExhibitorParticipation.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: { in: ids } },
    select: { id: true, eventId: true, exhibitorBusinessId: true, event: { select: { organizerId: true } } },
  }) : null;
  if (!candidate) return res.status(404).json({ error: "Participation not found" });
  const result = await prisma.$transaction(async (tx) => {
    if (!await lockBusinessPermission(tx, req.user!, candidate.exhibitorBusinessId, "eventExhibitor:manage", true)) return { kind: "forbidden" as const };
    await lockOrganizerForEntitlement(tx, candidate.event.organizerId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "events" WHERE "id" = $1 FOR UPDATE', candidate.eventId);
    const event = await tx.event.findFirst({ where: { id: candidate.eventId, organizerId: candidate.event.organizerId }, select: { id: true } });
    if (!event) return { kind: "not_found" as const };
    await tx.$queryRawUnsafe('SELECT "id" FROM "event_exhibitor_participations" WHERE "id" = $1 FOR UPDATE', candidate.id);
    const current = await tx.eventExhibitorParticipation.findUnique({ where: { id: candidate.id } });
    if (!current) return { kind: "not_found" as const };
    if (current.status === "WITHDRAWN") return { kind: "duplicate" as const, participation: current };
    if (current.status !== "APPLIED" && current.status !== "CONFIRMED") return { kind: "closed" as const, status: current.status };
    const changed = await tx.eventExhibitorParticipation.updateMany({
      where: { id: current.id, status: { in: ["APPLIED", "CONFIRMED"] } },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    });
    if (changed.count !== 1) return { kind: "changed" as const };
    return { kind: "withdrawn" as const, participation: await tx.eventExhibitorParticipation.findUniqueOrThrow({ where: { id: current.id } }) };
  });
  if (result.kind === "forbidden") return res.status(403).json({ error: "Exhibitor access changed. Refresh and retry." });
  if (result.kind === "not_found") return res.status(404).json({ error: "Participation not found" });
  if (result.kind === "closed") return res.status(409).json({ error: "A " + result.status + " application cannot be withdrawn" });
  if (result.kind === "changed") return res.status(409).json({ error: "Participation changed. Refresh and retry." });
  if (result.kind === "withdrawn") await logAudit({ actorUserId: req.user!.id, action: "event_exhibitor_participation.withdrawn",
    entityType: "EventExhibitorParticipation", entityId: candidate.id, metadata: { eventId: candidate.eventId, exhibitorBusinessId: candidate.exhibitorBusinessId } });
  return res.status(200).json({ participation: result.participation, duplicate: result.kind === "duplicate" });
});

router.get("/events/:eventId", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!isPlatformAdmin(req.user!)) {
      const membership = await tx.organizerMembership.findFirst({
        where: { organizerId: event.organizerId, userId: req.user!.id, status: "active", organizer: { suspended: false } },
        select: { role: true },
      });
      if (!membership || !can(organizerRoleToRole(membership.role), "eventExhibitor:view")) return { kind: "forbidden" as const };
    }
    const enabled = await tx.event.findFirst({
      where: { id: event.id, organizerId: event.organizerId, archivedAt: null, eventType: { not: "EXHIBITION" }, exhibition: { is: null },
        moduleEnablements: { some: { moduleType: "EXHIBITORS", enabled: true } } },
      select: { id: true },
    });
    if (!enabled) return { kind: "unavailable" as const };
    const participations = await tx.eventExhibitorParticipation.findMany({
      where: { eventId: event.id },
      include: { business: { select: { id: true, companyName: true, kycStatus: true } },
        reviewedByUser: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { kind: "ok" as const, participations };
  });
  if (!result || result.kind !== "ok") return res.status(404).json({ error: "Event not found" });
  return res.json({ participations: result.participations });
});

router.patch("/events/:eventId/:participationId/review", eventMutationRateLimit, async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid review" });
  const event = await prisma.event.findFirst({
    where: { id: req.params.eventId, archivedAt: null, eventType: { not: "EXHIBITION" }, exhibition: { is: null },
      moduleEnablements: { some: { moduleType: "EXHIBITORS", enabled: true } } },
    select: { id: true, organizerId: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });
  const organizerIds = await organizerIdsWithPermission(req.user!, "eventExhibitor:manage");
  if (!isPlatformAdmin(req.user!) && !organizerIds.includes(event.organizerId)) return res.status(404).json({ error: "Event not found" });
  const candidate = await prisma.eventExhibitorParticipation.findFirst({
    where: { id: req.params.participationId, eventId: event.id },
    select: { id: true, exhibitorBusinessId: true },
  });
  if (!candidate) return res.status(404).json({ error: "Application not found" });

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "exhibitor_businesses" WHERE "id" = $1 FOR UPDATE', candidate.exhibitorBusinessId);
    if (!locked.length) return { kind: "not_found" as const };
    await lockOrganizerForEntitlement(tx, event.organizerId);
    await tx.$queryRawUnsafe('SELECT "id" FROM "events" WHERE "id" = $1 FOR UPDATE', event.id);
    const currentEvent = await tx.event.findFirst({
      where: { id: event.id, organizerId: event.organizerId, archivedAt: null, eventType: { not: "EXHIBITION" }, exhibition: { is: null },
        moduleEnablements: { some: { moduleType: "EXHIBITORS", enabled: true } } },
      select: { id: true },
    });
    if (!currentEvent) return { kind: "not_found" as const };
    if (!isPlatformAdmin(req.user!)) {
      const membership = await tx.organizerMembership.findFirst({
        where: { organizerId: event.organizerId, userId: req.user!.id, status: "active", organizer: { suspended: false } },
        select: { role: true },
      });
      if (!membership || !can(organizerRoleToRole(membership.role), "eventExhibitor:manage")) return { kind: "forbidden" as const };
    }
    const business = await tx.exhibitorBusiness.findUnique({ where: { id: candidate.exhibitorBusinessId }, select: { suspended: true } });
    if (!business || (business.suspended && parsed.data.status === "CONFIRMED")) return { kind: "business_unavailable" as const };
    await tx.$queryRawUnsafe('SELECT "id" FROM "event_exhibitor_participations" WHERE "id" = $1 FOR UPDATE', candidate.id);
    const current = await tx.eventExhibitorParticipation.findFirst({ where: { id: candidate.id, eventId: event.id } });
    if (!current) return { kind: "not_found" as const };
    if (current.status === parsed.data.status) return { kind: "duplicate" as const, participation: current };
    if (current.status !== "APPLIED") return { kind: "reviewed" as const, status: current.status };
    const now = new Date();
    const changed = await tx.eventExhibitorParticipation.updateMany({
      where: { id: current.id, status: "APPLIED" },
      data: { status: parsed.data.status, reviewNote: parsed.data.reviewNote || null,
        reviewedByUserId: req.user!.id, reviewedAt: now, confirmedAt: parsed.data.status === "CONFIRMED" ? now : null },
    });
    if (changed.count !== 1) return { kind: "reviewed" as const, status: "changed" };
    return { kind: "updated" as const, participation: await tx.eventExhibitorParticipation.findUniqueOrThrow({ where: { id: current.id } }) };
  });
  if (result.kind === "not_found" || result.kind === "forbidden") return res.status(404).json({ error: "Application not found" });
  if (result.kind === "business_unavailable") return res.status(409).json({ error: "Exhibitor business is suspended or unavailable" });
  if (result.kind === "reviewed") return res.status(409).json({ error: "Application is no longer awaiting review (" + result.status + ")" });
  if (result.kind === "updated") await logAudit({ actorUserId: req.user!.id,
    action: parsed.data.status === "CONFIRMED" ? "event_exhibitor_participation.confirmed" : "event_exhibitor_participation.rejected",
    entityType: "EventExhibitorParticipation", entityId: candidate.id,
    metadata: { eventId: event.id, exhibitorBusinessId: candidate.exhibitorBusinessId } });
  return res.status(200).json({ participation: result.participation, duplicate: result.kind === "duplicate" });
});

export default router;
