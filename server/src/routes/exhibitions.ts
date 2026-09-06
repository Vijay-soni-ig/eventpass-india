import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { uploadCover, uploadFloorPlan, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitionMutationRateLimit } from "../middleware/rateLimit";
import { resolveOrganizerId } from "../lib/organizer";
import { organizerIdsWithPermission, hasAnyOrganizerMembership } from "../lib/access";
import { dateString } from "../lib/validation";
import { logAudit } from "../lib/audit";
import {
  lockOrganizerForEntitlement,
  assertCanCreateExhibition,
  assertCanAddExhibitor,
  assertCanCreateStall,
  EntitlementError,
  sendEntitlementError,
  logTrialConsumed,
  logEntitlementBlocked,
} from "../lib/entitlementService";
import { generateFollowerNotifications } from "../lib/notificationService";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// Phase 23.5 — the audit found this entire route file had no rate limiting
// at all, unlike every other mutation-heavy route file in this codebase.
// Scoped deliberately narrow: only the exhibition-level mutations
// (create/update/delete/duplicate/cover/floor-plan) — the higher-stakes,
// naturally low-frequency actions. NOT applied blanket-wide to every
// mutation in this file: ticket/stall/exhibitor-review sub-routes are
// legitimately called many times in one sitting while an organizer builds
// out a floor plan (a Growth-plan organizer may configure up to 150 stalls —
// an earlier, broader version of this limiter blocked exactly that
// legitimate bulk workflow, caught by entitlementDowngrade.test.ts's
// 29-stall creation test).

// ---------------------------------------------------------------------------
// Phase 23.5 — server-authoritative publish readiness. The audit found
// `status` was just another field in the generic create/update payload, with
// literally no gate on transitioning to "live" — an organizer (or a direct
// API call) could publish an event with no dates, no venue, and zero ticket
// types. This checklist is intentionally minimal: only what a public event
// page and this platform's core "sell tickets" purpose actually require —
// not every field the form happens to collect (refundPolicy/terms/category
// remain optional at every status, matching existing public-page behavior
// where their absence renders fine). Deliberately does NOT require a ticket
// type: an already-existing, intentional test
// (phase22cConsolidation.test.ts, "an event with no ticket types has no
// price to compare") proves the product already supports and relies on a
// live event with zero ticket types (e.g. a stall/exhibitor-only event) —
// requiring one here would break a real, evidenced-supported use case, not
// just a test.
// ---------------------------------------------------------------------------
class PublishReadinessError extends Error {
  constructor(public missing: string[]) {
    super(`Cannot publish — missing: ${missing.join(", ")}`);
  }
}

function assertPublishReady(fields: {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
  city: string | null;
}): void {
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("event name");
  if (!fields.startDate) missing.push("start date");
  if (!fields.endDate) missing.push("end date");
  if (!fields.venue?.trim()) missing.push("venue");
  if (!fields.city?.trim()) missing.push("city");
  if (missing.length > 0) throw new PublishReadinessError(missing);
}

function sendPublishReadinessError(res: import("express").Response, err: PublishReadinessError) {
  return res.status(400).json({ error: err.message, missing: err.missing });
}

// Phase 23.5 — date-ordering validation did not exist server-side at all
// (only the frontend checked it) — a direct API call could create/update an
// exhibition with endDate before startDate. Checked here directly against
// resolved Date objects (not as a zod .refine on the create/update schemas)
// because the update route only ever receives the fields actually present in
// a given PUT body — validating the FINAL merged state (existing + incoming)
// needs values a schema-level refine can't see.
class InvalidDateOrderError extends Error {
  constructor() {
    super("End date cannot be before start date");
  }
}

function assertValidDateOrder(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new InvalidDateOrderError();
  }
}

// "Managed" access (edit tickets/stalls/uploads) requires a membership role
// whose permissions include exhibition:update — not just being the
// original creator, matching the V2 rule that an Organizer (not a single
// user) owns the exhibition.
async function loadWithPermission(
  exhibitionId: string,
  user: Express.Request["user"],
  permission: Parameters<typeof organizerIdsWithPermission>[1],
) {
  const organizerIds = await organizerIdsWithPermission(user!, permission);
  if (organizerIds.length === 0) return null;
  return prisma.exhibition.findFirst({ where: { id: exhibitionId, organizerId: { in: organizerIds } } });
}

const loadManaged = (exhibitionId: string, user: Express.Request["user"]) =>
  loadWithPermission(exhibitionId, user, "exhibition:update");

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  const exhibitions = organizerIds.length
    ? await prisma.exhibition.findMany({
        where: { organizerId: { in: organizerIds } },
        include: {
          ticketTypes: true,
          stalls: true,
          _count: { select: { ticketBookings: true, stallBookings: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ exhibitions });
});

const ticketInput = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  taxPercent: z.number().nonnegative().default(0),
  visible: z.boolean().default(true),
});

const stallInput = z.object({
  code: z.string().optional(),
  stallType: z.enum(["premium", "standard", "basic"]).optional(),
  size: z.string().optional(),
  price: z.number().nonnegative(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  // Real venue coordinates, entered by the organizer — used by the public
  // /discover endpoint's "nearby" search (lat/lng/radiusKm params). Both
  // optional and independent of every other field: an exhibition with no
  // coordinates is simply excluded from nearby search, never geocoded or
  // defaulted server-side.
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  status: z.enum(["draft", "live", "paused", "completed"]).default("draft"),
  visibility: z.enum(["public", "private"]).default("public"),
  refundPolicy: z.string().optional(),
  terms: z.string().optional(),
  ticketTypes: z.array(ticketInput).default([]),
  stalls: z.array(stallInput).default([]),
});

router.post("/", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { ticketTypes, stalls, startDate, endDate, ...rest } = parsed.data;
  const resolvedStartDate = startDate ? new Date(startDate) : null;
  const resolvedEndDate = endDate ? new Date(endDate) : null;
  try {
    assertValidDateOrder(resolvedStartDate, resolvedEndDate);
    if (rest.status === "live") {
      assertPublishReady({ name: rest.name, startDate: resolvedStartDate, endDate: resolvedEndDate, venue: rest.venue ?? null, city: rest.city ?? null });
    }
  } catch (err) {
    if (err instanceof InvalidDateOrderError) return res.status(400).json({ error: err.message });
    if (err instanceof PublishReadinessError) return sendPublishReadinessError(res, err);
    throw err;
  }
  const creatableOrganizerIds = await organizerIdsWithPermission(req.user!, "exhibition:create");
  let organizerId: string;
  if (creatableOrganizerIds.length > 0) {
    organizerId = creatableOrganizerIds[0];
  } else if (await hasAnyOrganizerMembership(req.user!.id)) {
    // Has a real membership (e.g. finance/marketing/scanner) but that role
    // doesn't grant exhibition:create — deny, never silently bootstrap a
    // second organizer as a side-channel around the permission check.
    return res.status(403).json({ error: "You do not have permission to create exhibitions" });
  } else {
    organizerId = await resolveOrganizerId(req.user!.id);
  }

  try {
    let trialFirstExhibition = false;
    const exhibition = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, organizerId);
      const { wasTrialFirstExhibition } = await assertCanCreateExhibition(tx, organizerId);
      trialFirstExhibition = wasTrialFirstExhibition;
      if (stalls.length > 0) await assertCanCreateStall(tx, organizerId, stalls.length);

      return tx.exhibition.create({
        data: {
          ...rest,
          ownerId: req.user!.id,
          organizerId,
          startDate: resolvedStartDate ?? undefined,
          endDate: resolvedEndDate ?? undefined,
          ticketTypes: { create: ticketTypes },
          stalls: { create: stalls },
        },
        include: { ticketTypes: true, stalls: true },
      });
    });
    if (trialFirstExhibition) await logTrialConsumed(organizerId, req.user!.id, exhibition.id);
    await logAudit({
      actorUserId: req.user!.id,
      action: "exhibition.created",
      entityType: "Exhibition",
      entityId: exhibition.id,
      metadata: { organizerId, name: exhibition.name, status: exhibition.status },
    });
    res.status(201).json({ exhibition });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

router.get("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  const exhibition = organizerIds.length
    ? await prisma.exhibition.findFirst({
        where: { id: req.params.id, organizerId: { in: organizerIds } },
        include: { ticketTypes: true, stalls: true },
      })
    : null;
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  res.json({ exhibition });
});

const updateSchema = createSchema.partial().omit({ ticketTypes: true, stalls: true });

router.put("/:id", exhibitionMutationRateLimit, async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { startDate, endDate, ...rest } = parsed.data;

  // Phase 23.5 — validated against the FINAL merged state (existing values
  // for anything this particular PUT body doesn't touch), not just the
  // fields present in this request — a client that PUTs only {endDate: ...}
  // must not be able to leave an existing startDate stranded after it.
  const finalStartDate = startDate ? new Date(startDate) : existing.startDate;
  const finalEndDate = endDate ? new Date(endDate) : existing.endDate;
  const finalStatus = rest.status ?? existing.status;

  try {
    assertValidDateOrder(finalStartDate, finalEndDate);

    // Phase 23.5 — a date change on an exhibition that already has real
    // ticket bookings must not strand an existing booking's chosen visitDate
    // outside the new [startDate, endDate] window (a visitor holding a
    // ticket for a date the event no longer covers). Only queried when a
    // date is actually changing, since that's the only way this can happen.
    if ((startDate || endDate) && (finalStartDate || finalEndDate)) {
      const strandedBeforeStart = finalStartDate
        ? await prisma.ticketBooking.count({ where: { exhibitionId: existing.id, visitDate: { not: null, lt: finalStartDate } } })
        : 0;
      const strandedAfterEnd = finalEndDate
        ? await prisma.ticketBooking.count({ where: { exhibitionId: existing.id, visitDate: { not: null, gt: finalEndDate } } })
        : 0;
      if (strandedBeforeStart > 0 || strandedAfterEnd > 0) {
        return res.status(409).json({
          error: "This date change would leave one or more existing ticket bookings' visit dates outside the new event dates. Adjust the range or contact affected visitors first.",
        });
      }
    }

    if (finalStatus === "live") {
      assertPublishReady({
        name: rest.name ?? existing.name,
        startDate: finalStartDate,
        endDate: finalEndDate,
        venue: rest.venue ?? existing.venue,
        city: rest.city ?? existing.city,
      });
    }
  } catch (err) {
    if (err instanceof InvalidDateOrderError) return res.status(400).json({ error: err.message });
    if (err instanceof PublishReadinessError) return sendPublishReadinessError(res, err);
    throw err;
  }

  const exhibition = await prisma.exhibition.update({
    where: { id: existing.id },
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    include: { ticketTypes: true, stalls: true },
  });

  await notifyFollowersOfExhibitionChange(existing, exhibition);

  await logAudit({
    actorUserId: req.user!.id,
    action:
      existing.status !== "live" && exhibition.status === "live"
        ? "exhibition.published"
        : existing.status === "live" && exhibition.status !== "live"
        ? "exhibition.unpublished"
        : "exhibition.updated",
    entityType: "Exhibition",
    entityId: exhibition.id,
    metadata: { changedFields: Object.keys(rest), statusBefore: existing.status, statusAfter: exhibition.status },
  });

  res.json({ exhibition });
});

// Phase 22.3 — follower engagement notifications, triggered from the
// business event (a successful exhibition update), never from the
// frontend. Fires only for a live+public event (draft/private changes are
// never visitor-facing) and only for the specific transitions the phase
// scoped in: newly published (draft/paused -> live+public), a materially
// changed date on an already-published event, or another meaningful public
// field changing. Deliberately does NOT fire for every field in
// updateSchema — e.g. refundPolicy/terms/category changes are not
// considered notification-worthy. Never throws: a notification failure
// must not turn a successful exhibition update into a failed request (see
// notificationService.ts's own doc comment).
async function notifyFollowersOfExhibitionChange(
  before: { status: string; visibility: string; name: string; venue: string | null; city: string | null; startDate: Date | null; endDate: Date | null },
  after: { id: string; organizerId: string; status: string; visibility: string; name: string; venue: string | null; city: string | null; startDate: Date | null; endDate: Date | null; updatedAt: Date }
) {
  const wasLivePublic = before.status === "live" && before.visibility === "public";
  const isLivePublic = after.status === "live" && after.visibility === "public";
  if (!isLivePublic) return;

  const sourceVersion = after.updatedAt.toISOString();
  const actionUrl = `/exhibition/${after.id}`;

  if (!wasLivePublic) {
    const organizer = await prisma.organizer.findUnique({ where: { id: after.organizerId }, select: { name: true } });
    await generateFollowerNotifications({
      organizerId: after.organizerId,
      type: "EVENT_PUBLISHED",
      title: `New event from ${organizer?.name ?? "an organizer you follow"}`,
      message: `${after.name} is now available.`,
      entityType: "Exhibition",
      entityId: after.id,
      actionUrl,
      sourceVersion,
    });
    return;
  }

  const dateChanged = before.startDate?.getTime() !== after.startDate?.getTime() || before.endDate?.getTime() !== after.endDate?.getTime();
  const meaningfulFieldChanged = before.name !== after.name || before.venue !== after.venue || before.city !== after.city;

  if (dateChanged) {
    await generateFollowerNotifications({
      organizerId: after.organizerId,
      type: "EVENT_DATE_CHANGED",
      title: `${after.name}: date changed`,
      message: "The event date has been updated — check the new schedule.",
      entityType: "Exhibition",
      entityId: after.id,
      actionUrl,
      sourceVersion,
    });
  }
  if (meaningfulFieldChanged) {
    await generateFollowerNotifications({
      organizerId: after.organizerId,
      type: "EVENT_UPDATED",
      title: `${after.name}: details updated`,
      message: "This event's details have changed.",
      entityType: "Exhibition",
      entityId: after.id,
      actionUrl,
      sourceVersion,
    });
  }
}

router.delete("/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:delete");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  await prisma.exhibition.delete({ where: { id: existing.id } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.deleted",
    entityType: "Exhibition",
    entityId: existing.id,
    metadata: { name: existing.name, statusAtDeletion: existing.status },
  });
  res.status(204).end();
});

router.post("/:id/duplicate", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:create");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({
        where: { id: req.params.id, organizerId: { in: organizerIds } },
        include: { ticketTypes: true, stalls: true },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  try {
    let trialFirstExhibition = false;
    const copy = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, existing.organizerId);
      const { wasTrialFirstExhibition } = await assertCanCreateExhibition(tx, existing.organizerId);
      trialFirstExhibition = wasTrialFirstExhibition;
      if (existing.stalls.length > 0) await assertCanCreateStall(tx, existing.organizerId, existing.stalls.length);

      return tx.exhibition.create({
        data: {
          ownerId: req.user!.id,
          organizerId: existing.organizerId,
          name: `${existing.name} (Copy)`,
          category: existing.category,
          description: existing.description,
          venue: existing.venue,
          city: existing.city,
          startDate: existing.startDate,
          endDate: existing.endDate,
          status: "draft",
          visibility: existing.visibility,
          refundPolicy: existing.refundPolicy,
          terms: existing.terms,
          ticketTypes: {
            create: existing.ticketTypes.map((t) => ({
              name: t.name,
              price: t.price,
              quantity: t.quantity,
              taxPercent: t.taxPercent,
              visible: t.visible,
            })),
          },
          stalls: {
            create: existing.stalls.map((s) => ({
              code: s.code,
              stallType: s.stallType,
              size: s.size,
              price: s.price,
              posX: s.posX,
              posY: s.posY,
              width: s.width,
              height: s.height,
            })),
          },
        },
      });
    });
    if (trialFirstExhibition) await logTrialConsumed(existing.organizerId, req.user!.id, copy.id);
    res.status(201).json({ exhibition: copy });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(existing.organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

router.post("/:id/cover", exhibitionMutationRateLimit, handleUpload(uploadCover, "cover"), async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const coverImageUrl = fileUrl(req, "exhibition-covers", req.file.filename);
  const exhibition = await prisma.exhibition.update({ where: { id: existing.id }, data: { coverImageUrl } });
  res.json({ exhibition });
});

router.post("/:id/floor-plan", exhibitionMutationRateLimit, handleUpload(uploadFloorPlan, "floorPlan"), async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const floorPlanUrl = fileUrl(req, "floor-plans", req.file.filename);
  const exhibition = await prisma.exhibition.update({ where: { id: existing.id }, data: { floorPlanUrl } });
  res.json({ exhibition });
});

// -------- Ticket types --------

router.post("/:id/tickets", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = ticketInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const ticket = await prisma.ticketType.create({ data: { ...parsed.data, exhibitionId: existing.id } });
  await notifyIfTicketsNowAvailable(existing, false, ticket);
  res.status(201).json({ ticket });
});

router.put("/:id/tickets/:ticketId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = ticketInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const before = await prisma.ticketType.findUnique({ where: { id: req.params.ticketId, exhibitionId: existing.id } });
  const ticket = await prisma.ticketType.update({
    where: { id: req.params.ticketId, exhibitionId: existing.id },
    data: parsed.data,
  });
  const wasAvailable = before ? before.quantity > 0 && before.visible : false;
  await notifyIfTicketsNowAvailable(existing, wasAvailable, ticket);
  res.json({ ticket });
});

// Phase 22.3 — EVENT_TICKETS_AVAILABLE fires only on the true
// unavailable->available transition for a live+public event, never on
// every ticket edit (e.g. a price change on an already-available ticket
// type is not notification-worthy).
async function notifyIfTicketsNowAvailable(
  exhibition: { id: string; organizerId: string; name: string; status: string; visibility: string },
  wasAvailable: boolean,
  ticket: { id: string; quantity: number; visible: boolean; updatedAt: Date }
) {
  const isLivePublic = exhibition.status === "live" && exhibition.visibility === "public";
  const isAvailable = ticket.quantity > 0 && ticket.visible;
  if (!isLivePublic || wasAvailable || !isAvailable) return;

  await generateFollowerNotifications({
    organizerId: exhibition.organizerId,
    type: "EVENT_TICKETS_AVAILABLE",
    title: `Tickets available: ${exhibition.name}`,
    message: "Tickets are now available — grab yours before they sell out.",
    entityType: "TicketType",
    entityId: ticket.id,
    actionUrl: `/exhibition/${exhibition.id}`,
    sourceVersion: ticket.updatedAt.toISOString(),
  });
}

router.delete("/:id/tickets/:ticketId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  // Phase 23.5 — TicketBooking.ticketTypeId is onDelete: SetNull, so deleting
  // a ticket type that already has real bookings against it wouldn't crash,
  // it would silently orphan those bookings' ticket-type reference (a
  // visitor's paid booking would start showing "no ticket type"). Blocked
  // with a clear error instead — an organizer fixing a typo should edit the
  // ticket type in place (PUT), not delete and recreate it.
  const bookingCount = await prisma.ticketBooking.count({ where: { ticketTypeId: req.params.ticketId } });
  if (bookingCount > 0) {
    return res.status(409).json({ error: "Cannot delete a ticket type that already has bookings against it. Edit it instead, or hide it by setting visible to false." });
  }

  await prisma.ticketType.delete({ where: { id: req.params.ticketId, exhibitionId: existing.id } });
  res.status(204).end();
});

// -------- Stalls --------

router.post("/:id/stalls", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = stallInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const stall = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, existing.organizerId);
      await assertCanCreateStall(tx, existing.organizerId, 1);
      return tx.stall.create({ data: { ...parsed.data, exhibitionId: existing.id } });
    });
    res.status(201).json({ stall });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(existing.organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

const stallUpdateInput = stallInput.partial().extend({
  status: z.enum(["available", "reserved", "sold"]).optional(),
  buyerName: z.string().nullable().optional(),
  buyerEmail: z.string().nullable().optional(),
});

router.put("/:id/stalls/:stallId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = stallUpdateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const stall = await prisma.stall.update({
    where: { id: req.params.stallId, exhibitionId: existing.id },
    data: parsed.data,
  });
  res.json({ stall });
});

router.delete("/:id/stalls/:stallId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  await prisma.stall.delete({ where: { id: req.params.stallId, exhibitionId: existing.id } });
  res.status(204).end();
});

// -------- Exhibition <-> Exhibitor participation (organizer side) --------
//
// The exhibitor applies (see exhibitorParticipations.ts); the organizer's
// only role here is to approve or reject that application, and to update
// the booth number once approved. Organizers do not create participations
// directly — that would recreate the "exhibitor is just assigned to an
// exhibition" shortcut this workflow replaces.

router.get("/:id/exhibitors", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:view");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const participants = await prisma.exhibitionExhibitor.findMany({
    where: { exhibitionId: existing.id },
    include: { business: { select: { id: true, companyName: true } }, stalls: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ participants });
});

const reviewApplicationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  boothNumber: z.string().optional(),
});

router.patch("/:id/exhibitors/:participantId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = reviewApplicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const application = await prisma.exhibitionExhibitor.findFirst({
    where: { id: req.params.participantId, exhibitionId: existing.id },
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "applied") {
    return res.status(400).json({ error: `Cannot review an application that is already ${application.status}` });
  }

  try {
    const participant = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, existing.organizerId);
      // Only an approval consumes an exhibitor slot — rejecting never does.
      if (parsed.data.status === "approved") await assertCanAddExhibitor(tx, existing.organizerId);
      return tx.exhibitionExhibitor.update({
        where: { id: application.id },
        data: { status: parsed.data.status, boothNumber: parsed.data.boothNumber },
      });
    });
    res.json({ participant });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(existing.organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

router.patch("/:id/exhibitors/:participantId/cancel", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const application = await prisma.exhibitionExhibitor.findFirst({
    where: { id: req.params.participantId, exhibitionId: existing.id },
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status === "cancelled" || application.status === "rejected") {
    return res.status(400).json({ error: `Already ${application.status}` });
  }

  const participant = await prisma.$transaction(async (tx) => {
    await tx.stall.updateMany({
      where: { exhibitionExhibitorId: application.id },
      data: { exhibitionExhibitorId: null, status: "available" },
    });
    return tx.exhibitionExhibitor.update({ where: { id: application.id }, data: { status: "cancelled" } });
  });
  res.json({ participant });
});

export default router;
