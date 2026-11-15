import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import type { Permission } from "../lib/permissions";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership, isPlatformAdmin } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { createPaymentRecord, createProviderOrderForPayment, applyPaymentOutcome } from "../lib/paymentService";
import { getPublishedFloorPlan, getPublishedFloorPlans } from "../lib/floorPlanQueries";
import { lockStallForUpdate, expireStallIfEligible, recordReservationExpiryAudit, releaseExpiredReservations } from "../lib/stallReservationExpiry";
import { exhibitorParticipationMutationRateLimit, exhibitorStallReservationRateLimit, exhibitorPaymentMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

// Membership mutations lock the business row first. Participation writes use
// the same lock order, then re-read the caller's active membership and role
// inside the write transaction so revocation/demotion cannot race the write.
async function lockAndCheckExhibitorManage(
  tx: Prisma.TransactionClient,
  userId: string,
  businessId: string,
  isPlatformAdmin: boolean
): Promise<boolean> {
  await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;
  if (isPlatformAdmin) return true;
  const membership = await tx.exhibitorMembership.findFirst({
    where: {
      exhibitorBusinessId: businessId,
      userId,
      status: "active",
      business: { suspended: false },
    },
    select: { role: true },
  });

  return !!membership && can(exhibitorRoleToRole(membership.role), "exhibitionExhibitor:manage");
}

/**
 * Read participation and payment data only while the caller's current
 * membership is revalidated under the same business-row lock used by
 * membership mutations. The initial ID lookup is only a candidate set;
 * it is never treated as final authorization.
 */
async function withExhibitorReadPermission<T>(
  user: Parameters<typeof exhibitorBusinessIdsWithPermission>[0],
  permission: Permission,
  operation: (tx: Prisma.TransactionClient, authorizedBusinessIds: string[]) => Promise<T>,
): Promise<T> {
  const candidateBusinessIds = await exhibitorBusinessIdsWithPermission(user, permission);
  return prisma.$transaction(async (tx) => {
    const authorizedBusinessIds: string[] = [];
    for (const businessId of [...candidateBusinessIds].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;
      if (user.platformRole === "super_admin") {
        authorizedBusinessIds.push(businessId);
        continue;
      }
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (membership && can(exhibitorRoleToRole(membership.role), permission)) {
        authorizedBusinessIds.push(businessId);
      }
    }
    return operation(tx, authorizedBusinessIds);
  });
}

// "Exhibitions my business participates in" — the exhibitor-side mirror of
// organizer's exhibitions.ts. Access is scoped to ExhibitionExhibitor rows
// for businesses the caller has an active membership in; a business that
// hasn't applied to (or had an application approved for) an exhibition
// never appears.
router.get("/", async (req, res) => {
  const participations = await withExhibitorReadPermission(
    req.user!,
    "exhibitionExhibitor:view",
    async (tx, businessIds) => businessIds.length
      ? await tx.exhibitionExhibitor.findMany({
          where: {
            exhibitorBusinessId: { in: businessIds },
            exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
          },
          include: {
            exhibition: {
              include: {
                event: {
                  select: {
                    id: true, title: true, description: true,
                    category: { select: { name: true } },
                    coverImageUrl: true, venue: true, city: true,
                    startDate: true, endDate: true, status: true, visibility: true,
                    refundPolicy: true, terms: true, timezone: true,
                  },
                },
              },
            },
            stalls: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [],
  );
  const canonicalParticipations = participations.map((participation) => {
    const event = participation.exhibition.event;
    if (!event) return participation;
    return {
      ...participation,
      exhibition: {
        ...participation.exhibition,
        eventId: event.id,
        name: event.title,
        description: event.description,
        category: event.category?.name ?? participation.exhibition.category,
        coverImageUrl: event.coverImageUrl,
        venue: event.venue,
        city: event.city,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status === "DRAFT" ? "draft" : event.status === "PUBLISHED" ? "live" : event.status === "PAUSED" ? "paused" : event.status === "COMPLETED" ? "completed" : event.status.toLowerCase(),
        visibility: event.visibility,
        refundPolicy: event.refundPolicy,
        terms: event.terms,
        timezone: event.timezone,
      },
    };
  });
  res.json({ participations: canonicalParticipations });
});

// -------- 1. Apply to an exhibition --------

const applySchema = z.object({ exhibitionId: z.string() });

router.post("/", exhibitorParticipationMutationRateLimit, async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await prisma.exhibition.findFirst({
    where: {
      id: parsed.data.exhibitionId,
      OR: [
        { event: { status: "PUBLISHED", visibility: "public", archivedAt: null } },
        { eventId: null, status: "live", visibility: "public" },
      ],
    },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  // A brand-new exhibitor account (no business/membership yet) can still
  // apply — this bootstraps their ExhibitorBusiness as "owner", mirroring
  // the same first-use pattern already used for organizer creation and
  // business-profile setup elsewhere in the API. A user who already has a
  // membership but the wrong role (e.g. staff) is denied outright, never
  // silently handed a second, brand-new business as a side-channel.
  const manageableIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();
  let businessId: string;
  if (manageableIds.length > 0 || requestedBusinessId) {
    const selection = resolveActiveBusinessSelection(manageableIds, requestedBusinessId);
    if ("error" in selection) return res.status(selection.status).json({ error: selection.error });
    if (!selection.businessId) {
      return res.status(403).json({ error: "You do not have permission to apply on behalf of your exhibitor business" });
    }
    businessId = selection.businessId;
  } else if (await hasAnyExhibitorMembership(req.user!.id)) {
    return res.status(403).json({ error: "You do not have permission to apply on behalf of your exhibitor business" });
  } else {
    businessId = await resolveExhibitorBusinessId(req.user!.id);
  }
  // Keep the unique lookup as a fast, friendly path. The insert is still
  // protected by the database unique constraint, while the transaction below
  // locks the business and revalidates membership/role immediately before
  // creating the participation.
  const existing = await prisma.exhibitionExhibitor.findUnique({
    where: { exhibitionId_exhibitorBusinessId: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId } },
  });
  if (existing) return res.status(409).json({ error: "You have already applied to this exhibition" });

  try {
    const participation = await prisma.$transaction(async (tx) => {
      const allowed = await lockAndCheckExhibitorManage(
        tx, req.user!.id, businessId, req.user!.platformRole === "super_admin"
      );
      if (!allowed) return null;
      return tx.exhibitionExhibitor.create({
        data: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId, status: "applied" },
      });
    });
    if (!participation) return res.status(404).json({ error: "Exhibitor business access changed. Refresh and try again." });
    res.status(201).json({ participation });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "You have already applied to this exhibition" });
    }
    throw err;
  }
});

// -------- 3. Withdraw / cancel a participation --------

router.patch("/:id/cancel", exhibitorParticipationMutationRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const existing = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds }, exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Participation not found" });
  if (existing.status !== "applied" && existing.status !== "stall_reserved") {
    return res.status(409).json({
      error: "Only an application awaiting approval or a stall reservation with no active payment can be cancelled. Complete or resolve any payment attempt first.",
    });
  }

  // A reserved-but-unpaid stall can be safely released on explicit withdrawal.
  // Use the same stall-row lock as selection, payment initiation and expiry.
  // Payment-pending/paid states are deliberately rejected: a late provider
  // capture must never be detached from inventory by a cancellation request.
  const cancelled = await prisma.$transaction(async (tx) => {
    const allowed = await lockAndCheckExhibitorManage(
      tx, req.user!.id, existing.exhibitorBusinessId, req.user!.platformRole === "super_admin"
    );
    if (!allowed) return { kind: "forbidden" as const };

    if (existing.status === "applied") {
      const updated = await tx.exhibitionExhibitor.updateMany({
        where: { id: existing.id, exhibitorBusinessId: existing.exhibitorBusinessId, status: "applied" },
        data: { status: "cancelled" },
      });
      return updated.count === 1
        ? { kind: "cancelled" as const, previousStatus: "applied" as const, stallId: null }
        : { kind: "changed" as const };
    }

    const candidate = await tx.stall.findFirst({
      where: { exhibitionExhibitorId: existing.id, status: "reserved" },
      select: { id: true },
    });
    if (!candidate) return { kind: "changed" as const };
    const locked = await lockStallForUpdate(tx, candidate.id);
    if (!locked || locked.status !== "reserved" || locked.exhibitionExhibitorId !== existing.id) {
      return { kind: "changed" as const };
    }
    const current = await tx.exhibitionExhibitor.findUnique({
      where: { id: existing.id },
      select: { status: true, exhibitorBusinessId: true },
    });
    if (!current || current.status !== "stall_reserved" || current.exhibitorBusinessId !== existing.exhibitorBusinessId) {
      return { kind: "changed" as const };
    }
    const released = await tx.stall.updateMany({
      where: { id: locked.id, status: "reserved", exhibitionExhibitorId: existing.id },
      data: { status: "available", exhibitionExhibitorId: null, reservedAt: null },
    });
    if (released.count !== 1) return { kind: "changed" as const };
    const updated = await tx.exhibitionExhibitor.updateMany({
      where: { id: existing.id, exhibitorBusinessId: existing.exhibitorBusinessId, status: "stall_reserved" },
      data: { status: "cancelled" },
    });
    if (updated.count !== 1) throw new Error("PARTICIPATION_CANCEL_RACE");
    return { kind: "cancelled" as const, previousStatus: "stall_reserved" as const, stallId: locked.id };
  });
  if (cancelled.kind === "forbidden") {
    return res.status(404).json({ error: "Participation not found" });
  }
  if (cancelled.kind === "changed") {
    return res.status(409).json({ error: "This application or reservation has changed. Refresh and try again." });
  }

  const participation = await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: existing.id } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibitor.participation_cancelled",
    entityType: "ExhibitionExhibitor",
    entityId: existing.id,
    metadata: { previousStatus: cancelled.previousStatus, status: "cancelled", stallId: cancelled.stallId },
  });
  res.json({ participation });
});

// -------- 4/5. Select & reserve a stall (only once approved) --------

const selectStallSchema = z.object({ stallId: z.string() });

router.post("/:id/stall", exhibitorStallReservationRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds }, exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] } },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });
  if (participation.status !== "approved") {
    return res.status(400).json({ error: "Your application must be approved before selecting a stall" });
  }

  const parsed = selectStallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const allowed = await lockAndCheckExhibitorManage(
        tx, req.user!.id, participation.exhibitorBusinessId, req.user!.platformRole === "super_admin"
      );
      if (!allowed) return { kind: "forbidden" as const };
      // Phase 30 (FP-05): lock the stall row before making any decision — the
      // same lock exhibitorParticipations.ts's /:id/payment route takes on
      // this same row, so the two can never both act on a stale read of each
      // other's outcome (see stallReservationExpiry.ts's file-level comment
      // for the full race this closes).
      const locked = await lockStallForUpdate(tx, parsed.data.stallId);
      if (!locked || locked.exhibitionId !== participation.exhibitionId) throw new Error("STALL_NOT_FOUND");

      let expiredFrom: string | undefined;
      let claimable = locked.status === "available";
      if (!claimable) {
        const expiry = await expireStallIfEligible(tx, locked);
        if (expiry.expired) {
          claimable = true;
          expiredFrom = expiry.participationId;
        }
      }
      if (!claimable) throw new Error("STALL_UNAVAILABLE");

      // Conditional update guards against a concurrent request reserving the
      // same stall between the checks above and this write (the TOCTOU race
      // the original single-buyer stall-booking endpoint was vulnerable to) —
      // the row lock above already serializes concurrent callers here, but
      // the WHERE clause is kept as defense in depth rather than relying on
      // lock ordering alone.
      const claimed = await tx.stall.updateMany({
        where: { id: locked.id, status: "available" },
        data: { status: "reserved", exhibitionExhibitorId: participation.id, reservedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("STALL_UNAVAILABLE");

      const updatedParticipation = await tx.exhibitionExhibitor.updateMany({
        where: { id: participation.id, status: "approved" },
        data: { status: "stall_reserved" },
      });
      if (updatedParticipation.count === 0) throw new Error("PARTICIPATION_CHANGED");

      const full = await tx.exhibitionExhibitor.findUniqueOrThrow({
        where: { id: participation.id },
        include: { stalls: true },
      });
      return { kind: "reserved" as const, full, expiredFrom, stallId: locked.id };
    });

    if (result.kind === "forbidden") {
      return res.status(404).json({ error: "Participation not found" });
    }
    if (result.expiredFrom) {
      await recordReservationExpiryAudit(participation.exhibitionId, result.stallId, result.expiredFrom);
    }
    res.json({ participation: result.full });
  } catch (err) {
    if (err instanceof Error && err.message === "STALL_NOT_FOUND") {
      return res.status(404).json({ error: "Stall not found" });
    }
    if (err instanceof Error && (err.message === "STALL_UNAVAILABLE" || err.message === "PARTICIPATION_CHANGED")) {
      return res.status(409).json({ error: "That stall was just taken by someone else. Please pick another." });
    }
    throw err;
  }
});

// -------- 5b. View the exhibition's published floor plan --------
//
// Phase 29 (FP-04) — the visual floor-plan map (FP-03) was previously only
// reachable via the PUBLIC endpoint (GET /api/public/exhibitions/:id/floor-
// plan), which requires the exhibition to be status:{live,completed} and
// visibility:public. That's the right gate for anonymous visitors, but wrong
// for an approved exhibitor's own onboarding flow: an organizer could
// un-list an exhibition from public discovery while still running exhibitor
async function getAuthorizedPublishedFloorPlans(
  user: NonNullable<Parameters<typeof withExhibitorReadPermission>[0]>,
  participationId: string,
): Promise<Awaited<ReturnType<typeof getPublishedFloorPlans>> | null> {
  // First authorize the participation before triggering lazy expiry maintenance.
  // The result is only an exhibition ID; no private floor-plan data is read here.
  const exhibitionId = await withExhibitorReadPermission(
    user,
    "exhibitionExhibitor:manage",
    async (tx, businessIds) => {
      if (!businessIds.length) return null;
      const participation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: participationId,
          exhibitorBusinessId: { in: businessIds },
          exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
        },
        select: { exhibitionId: true },
      });
      return participation?.exhibitionId ?? null;
    },
  );
  if (!exhibitionId) return null;

  // Lazy expiry uses its own short transactions and stall locks. After it
  // completes, re-authorize and keep the exhibitor business lock held for
  // every published-plan/object/stall read so membership changes cannot race
  // the response data.
  await releaseExpiredReservations(exhibitionId);

  return withExhibitorReadPermission(
    user,
    "exhibitionExhibitor:manage",
    async (tx, businessIds) => {
      if (!businessIds.length) return null;
      const participation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: participationId,
          exhibitorBusinessId: { in: businessIds },
          exhibitionId,
          exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
        },
        select: { id: true },
      });
      if (!participation) return null;
      return getPublishedFloorPlans(exhibitionId, tx);
    },
  );
}

// onboarding, and the exhibitor's access to their own approved
// participation's floor plan shouldn't depend on public-visibility rules
// designed for anonymous browsing.
//
// Same ownership check as every other route in this file — 404-not-403, no
// enumeration signal — but deliberately does NOT require
// participation.status === "approved" the way POST /:id/stall does: viewing
// the map is harmless regardless of where the participation currently sits
// in its lifecycle (applied/approved/stall_reserved/payment_pending/
// confirmed can all reasonably want to see it); only the mutating
// stall-selection action requires approval.
router.get("/:id/floor-plan", async (req, res) => {
  const floorPlans = await getAuthorizedPublishedFloorPlans(req.user!, req.params.id);
  if (floorPlans === null) return res.status(404).json({ error: "Participation not found" });
  const floorPlan = floorPlans[0] ?? null;
  if (!floorPlan) return res.status(404).json({ error: "No published floor plan" });
  return res.json({ floorPlan });
});

// All halls' published plans, for the multi-hall stall picker. Same authorization rules.
router.get("/:id/floor-plans", async (req, res) => {
  const floorPlans = await getAuthorizedPublishedFloorPlans(req.user!, req.params.id);
  if (floorPlans === null) return res.status(404).json({ error: "Participation not found" });
  return res.json({ floorPlans });
});

// -------- 6. Initiate or retry payment for the reserved stall --------
//
// Creates a real gateway order (Payment status "created") and a StallBooking
// linked to it. Nothing here ever marks the payment paid — that only ever
// happens via a verified checkout signature (POST /api/payments/:id/verify)
// or the gateway's webhook (POST /api/webhooks/payments/:provider), both of
// which route through the same applyPaymentOutcome transition.
//
// Retry-safe (Phase 21B): a participation stuck in "payment_pending" because
// its only payment attempt was never resolved (browser closed, network
// drop, no webhook ever arrived) previously had no way back — this endpoint
// only ever accepted "stall_reserved". It now also accepts "payment_pending"
// and inspects the most recent attempt before deciding what to do: an
// already-paid attempt is returned as-is (never duplicated), a still-fresh
// created/pending attempt is handed back unchanged (so a duplicate click or
// page reload resumes the same order instead of opening a second one), and
// only a stale (older than STALE_PAYMENT_ATTEMPT_MS) or already
// failed/cancelled attempt is retired — via the same applyPaymentOutcome
// transition a real gateway failure uses, never a bespoke status write —
// before a fresh attempt opens.
const STALE_PAYMENT_ATTEMPT_MS = 15 * 60 * 1000;

router.post("/:id/payment", exhibitorPaymentMutationRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds }, exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] } },
        include: { stalls: true },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });
  // "confirmed" is accepted here too — not to allow a second payment (the
  // already-paid check below returns immediately for that case), but so a
  // client that calls this endpoint again after a successful payment (a
  // stale UI, a duplicate click that lands after the success response was
  // already handled) gets back the real current state instead of a
  // confusing 400 for a stall it actually already has.
  if (!["stall_reserved", "payment_pending", "confirmed"].includes(participation.status)) {
    return res.status(400).json({ error: "Select and reserve a stall before starting payment" });
  }

  const stall = participation.stalls[0];
  if (!stall) return res.status(400).json({ error: "No reserved stall found for this participation" });

  const latestBooking = await prisma.stallBooking.findFirst({
    where: { exhibitionExhibitorId: participation.id },
    orderBy: { createdAt: "desc" },
    include: { payment: true },
  });

  if (latestBooking?.payment) {
    // The preflight lookup above is only a hint. Paid and in-flight branches
    // return private payment/order data, so revalidate membership and re-read
    // the current participation and latest booking under the tenant lock.
    const resume = await prisma.$transaction(async (tx) => {
      const allowed = await lockAndCheckExhibitorManage(
        tx, req.user!.id, participation.exhibitorBusinessId, req.user!.platformRole === "super_admin"
      );
      if (!allowed) return { kind: "forbidden" as const };
      const currentParticipation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: participation.id,
          exhibitorBusinessId: participation.exhibitorBusinessId,
          status: { in: ["stall_reserved", "payment_pending", "confirmed"] },
          exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
        },
        include: { stalls: true },
      });
      if (!currentParticipation) return { kind: "not_found" as const };
      const currentBooking = await tx.stallBooking.findFirst({
        where: { exhibitionExhibitorId: currentParticipation.id },
        orderBy: { createdAt: "desc" },
        include: { payment: true },
      });
      const currentPayment = currentBooking?.payment;
      if (!currentBooking || !currentPayment || currentBooking.stallId !== currentParticipation.stalls[0]?.id) {
        return { kind: "continue" as const };
      }
      if (currentPayment.status === "paid") {
        return { kind: "paid" as const, booking: currentBooking, payment: currentPayment };
      }
      if (
        (currentPayment.status === "created" || currentPayment.status === "pending") &&
        Date.now() - currentPayment.createdAt.getTime() < STALE_PAYMENT_ATTEMPT_MS
      ) {
        return { kind: "pending" as const, booking: currentBooking, payment: currentPayment };
      }
      return { kind: "continue" as const };
    });
    if (resume.kind === "forbidden" || resume.kind === "not_found") {
      return res.status(404).json({ error: "Participation not found" });
    }
    if (resume.kind === "paid") {
      return res.status(200).json({ booking: resume.booking, payment: resume.payment, alreadyPaid: true });
    }
    if (resume.kind === "pending") {
      return res.status(200).json({ booking: resume.booking, payment: resume.payment });
    }
    // Stale/failed/cancelled attempts fall through to the normal transition
    // and fresh-attempt claim below. Only the preflight's stale marker is
    // used to decide whether stale cleanup is needed, never to return PII.
    if (latestBooking.payment.status === "created" || latestBooking.payment.status === "pending") {
      const ageMs = Date.now() - latestBooking.payment.createdAt.getTime();
      if (ageMs >= STALE_PAYMENT_ATTEMPT_MS) {
        await applyPaymentOutcome(latestBooking.payment.id, "cancelled");
      }
    }
  }

  // Persist the payment locally first. The database claim and booking below
  // must win before any provider order is created; otherwise concurrent stale
  // retries can create multiple external orders even though only one booking
  // attempt is allowed to win.
  const { payment } = await createPaymentRecord({ baseAmount: Number(stall.price) });

  // Phase 30 (FP-05): the transaction below returns a discriminated result
  // rather than throwing for its "someone else changed things underneath us"
  // outcomes — throwing inside prisma.$transaction rolls back the WHOLE
  // transaction, including expireStallIfEligible's own writes made earlier
  // in the SAME transaction. Returning normally lets the expiry release
  // commit while still skipping the payment_pending flip and booking
  // creation that follow it.
  const result = await prisma.$transaction(async (tx) => {
    const allowed = await lockAndCheckExhibitorManage(
      tx, req.user!.id, participation.exhibitorBusinessId, req.user!.platformRole === "super_admin"
    );
    if (!allowed) return { kind: "forbidden" as const };
    // Lock the stall row before deciding whether this payment attempt may
    // start — the same lock POST /:id/stall takes on this same row. If a
    // reservation has quietly passed its 1-hour expiry right as payment is
    // being initiated, expire it here (never let a payment attempt begin
    // against an already-expired reservation) rather than proceeding and
    // relying on some other read to catch it later. See
    // stallReservationExpiry.ts for why the row lock — not just the status
    // check below — is what actually makes this race-safe.
    const locked = await lockStallForUpdate(tx, stall.id);
    if (locked) {
      const expiry = await expireStallIfEligible(tx, locked);
      if (expiry.expired) return { kind: "expired" as const };
    }

    // Conditional update guards against a second concurrent retry request
    // that raced through the same stale-attempt branch above — only the
    // first request to reach here can actually flip the participation, so
    // at most one fresh payment attempt is ever created per stale attempt.
    const claimed = await tx.exhibitionExhibitor.updateMany({
      where: { id: participation.id, status: "stall_reserved" },
      data: { status: "payment_pending" },
    });
    if (claimed.count === 0) return { kind: "participation_changed" as const };

    const booking = await tx.stallBooking.create({
      data: {
        stallId: stall.id,
        exhibitionId: participation.exhibitionId,
        exhibitionExhibitorId: participation.id,
        buyerUserId: req.user!.id,
        amountPaid: stall.price,
        paymentStatus: "created",
        paymentId: payment.id,
      },
    });
    return { kind: "booked" as const, booking };
  });

  if (result.kind === "forbidden") {
    await applyPaymentOutcome(payment.id, "cancelled");
    return res.status(404).json({ error: "Participation not found" });
  }
  if (result.kind === "expired") {
    // The stall was just released by the expiry check above (already
    // committed — this transaction returned normally) — retire this order
    // (never shown to any client) rather than leaving it orphaned pointing
    // at a stall this participation no longer holds.
    await applyPaymentOutcome(payment.id, "cancelled");
    await recordReservationExpiryAudit(participation.exhibitionId, stall.id, participation.id);
    return res.status(409).json({ error: "Your reservation for this stall expired. Please select a stall again." });
  }
  if (result.kind === "participation_changed") {
    await applyPaymentOutcome(payment.id, "cancelled");
    const current = await prisma.stallBooking.findFirst({
      where: { exhibitionExhibitorId: participation.id },
      orderBy: { createdAt: "desc" },
      include: { payment: true },
    });
    return res.status(409).json({
      error: "A payment attempt for this participation was already started. Please refresh and try again.",
      booking: current,
    });
  }
  // Only the request that successfully claimed payment_pending and
  // created the booking may open an external provider order. Losing concurrent
  // requests are cancelled above without ever creating a provider-side order.
  try {
    const opened = await createProviderOrderForPayment({
      paymentId: payment.id,
      notes: { exhibitionExhibitorId: participation.id, stallId: stall.id, buyerUserId: req.user!.id },
    });
    res.status(201).json({ booking: result.booking, payment: opened.payment, order: opened.order });
  } catch {
    const currentPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (currentPayment?.status === "failed") {
      await applyPaymentOutcome(payment.id, "failed");
      return res.status(502).json({
        error: "Unable to initialize the payment order. Your stall reservation is available for another attempt.",
      });
    }
    // The provider may have created an order while persistence of its response
    // failed. Do not mark this attempt failed or release inventory: reconcile
    // it from the provider before allowing a second order.
    return res.status(503).json({
      error: "Payment order initialization is being reconciled. Please retry shortly.",
      paymentId: payment.id,
    });
  }
});

// -------- 9. Stall payments across ALL of the caller's own participations --------
//
// Phase 21B (P0-2 fix): the exhibitor "Sales" page previously read
// organizer-scoped booking endpoints and always saw an empty/zero result
// for a pure exhibitor account. This is the smallest secure endpoint that
// actually answers "what has my exhibitor business paid for stalls" —
// scoped by exhibitorBusinessIdsWithPermission exactly like every other
// route in this file, never by organizer membership. Must be declared
// before the "/:id/payments" route below so "/payments" (one segment)
// isn't shadowed by it (it isn't — Express only matches "/:id/payments" for
// a two-segment path — but the more specific static route is kept first for
// clarity).
router.get("/payments", async (req, res) => {
  const canReadPayments = isPlatformAdmin(req.user!) ||
    (await exhibitorBusinessIdsWithPermission(req.user!, "exhibitorPayment:view")).length > 0;
  if (!canReadPayments) {
    return res.status(403).json({ error: "Exhibitor payment access is restricted to owners and admins" });
  }
  const bookings = await withExhibitorReadPermission(
    req.user!,
    "exhibitorPayment:view",
    async (tx, businessIds) => businessIds.length
      ? await tx.stallBooking.findMany({
          where: { exhibitionExhibitor: { exhibitorBusinessId: { in: businessIds } } },
          include: { payment: true, stall: true, exhibition: true },
          orderBy: { createdAt: "desc" },
        })
      : [],
  );
  res.json({ bookings });
});

// -------- 10. Payment history for a participation --------

router.get("/:id/payments", async (req, res) => {
  const result = await withExhibitorReadPermission(
    req.user!,
    "exhibitorPayment:view",
    async (tx, businessIds) => {
      if (businessIds.length === 0) return null;
      const participation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: req.params.id,
          exhibitorBusinessId: { in: businessIds },
          exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
        },
        select: { id: true },
      });
      if (!participation) return null;
      return tx.stallBooking.findMany({
        where: { exhibitionExhibitorId: participation.id },
        include: { payment: true, stall: true },
        orderBy: { createdAt: "desc" },
      });
    },
  );
  if (result === null) return res.status(404).json({ error: "Participation not found" });
  res.json({ bookings: result });
});

export default router;