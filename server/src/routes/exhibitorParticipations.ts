import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { createOrderForPayment, applyPaymentOutcome } from "../lib/paymentService";
import { getPublishedFloorPlan } from "../lib/floorPlanQueries";
import { lockStallForUpdate, expireStallIfEligible, recordReservationExpiryAudit, releaseExpiredReservations } from "../lib/stallReservationExpiry";
import { exhibitorParticipationMutationRateLimit, exhibitorStallReservationRateLimit, exhibitorPaymentMutationRateLimit } from "../middleware/rateLimit";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

// "Exhibitions my business participates in" — the exhibitor-side mirror of
// organizer's exhibitions.ts. Access is scoped to ExhibitionExhibitor rows
// for businesses the caller has an active membership in; a business that
// hasn't applied to (or had an application approved for) an exhibition
// never appears.
router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:view");
  const participations = businessIds.length
    ? await prisma.exhibitionExhibitor.findMany({
        where: { exhibitorBusinessId: { in: businessIds } },
        include: {
          exhibition: {
            include: {
              event: {
                select: {
                  id: true, title: true, description: true,
                  category: { select: { name: true } },
                  coverImageUrl: true, venue: true, city: true, latitude: true, longitude: true,
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
    : [];
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
        latitude: event.latitude,
        longitude: event.longitude,
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
  let businessId: string;
  if (manageableIds.length > 0) {
    businessId = manageableIds[0];
  } else if (await hasAnyExhibitorMembership(req.user!.id)) {
    return res.status(403).json({ error: "You do not have permission to apply on behalf of your exhibitor business" });
  } else {
    businessId = await resolveExhibitorBusinessId(req.user!.id);
  }
  // A findUnique-then-create here would leave a TOCTOU window: two
  // concurrent applications for the same (exhibitionId, exhibitorBusinessId)
  // could both pass the pre-check and both attempt to create, and the loser
  // would hit the DB's unique constraint as a raw, uncaught error. The
  // findUnique below is kept only as a fast, friendly path for the by far
  // most common (non-racing) case — it saves a wasted insert attempt and
  // returns the same 409 a fraction faster — but the actual correctness
  // guarantee is the @@unique([exhibitionId, exhibitorBusinessId])
  // constraint plus the catch below, not this check. No transaction is
  // needed: a single-statement insert guarded by a unique constraint is
  // already atomic at the database level, and wrapping it in one would add
  // locking without closing any gap this approach doesn't already close.
  const existing = await prisma.exhibitionExhibitor.findUnique({
    where: { exhibitionId_exhibitorBusinessId: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId } },
  });
  if (existing) return res.status(409).json({ error: "You have already applied to this exhibition" });

  try {
    const participation = await prisma.exhibitionExhibitor.create({
      data: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId, status: "applied" },
    });
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
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Participation not found" });
  if (existing.status === "cancelled" || existing.status === "rejected") {
    return res.status(400).json({ error: `Cannot cancel a participation that is already ${existing.status}` });
  }

  const participation = await prisma.$transaction(async (tx) => {
    // Release any stall this participation was holding, back to available.
    await tx.stall.updateMany({
      where: { exhibitionExhibitorId: existing.id },
      data: { exhibitionExhibitorId: null, status: "available", reservedAt: null },
    });
    return tx.exhibitionExhibitor.update({ where: { id: existing.id }, data: { status: "cancelled" } });
  });
  res.json({ participation });
});

// -------- 4/5. Select & reserve a stall (only once approved) --------

const selectStallSchema = z.object({ stallId: z.string() });

router.post("/:id/stall", exhibitorStallReservationRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
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
      return { full, expiredFrom, stallId: locked.id };
    });

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
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });

  // Phase 30 (FP-05): give any stall whose reservation has quietly expired a
  // chance to release before rendering the map, so this view never shows a
  // "reserved" tile that's actually been free for a while.
  await releaseExpiredReservations(participation.exhibitionId);

  const floorPlan = await getPublishedFloorPlan(participation.exhibitionId);
  if (!floorPlan) return res.status(404).json({ error: "No published floor plan" });

  return res.json({ floorPlan });
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
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
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
    const existingPayment = latestBooking.payment;
    if (existingPayment.status === "paid") {
      // Already succeeded — applyPaymentOutcome already moved the
      // participation to "confirmed" when this happened. Never start a
      // second payment for a stall that's already been paid for.
      return res.status(200).json({ booking: latestBooking, payment: existingPayment, alreadyPaid: true });
    }
    if (existingPayment.status === "created" || existingPayment.status === "pending") {
      const ageMs = Date.now() - existingPayment.createdAt.getTime();
      if (ageMs < STALE_PAYMENT_ATTEMPT_MS) {
        // Still within its normal completion window — hand back the same
        // order instead of opening a second one for the same stall.
        return res.status(200).json({ booking: latestBooking, payment: existingPayment });
      }
      // Stale: the previous attempt was almost certainly abandoned. Retire
      // it through the same real transition a gateway failure/cancellation
      // uses — this also correctly reverts the participation back to
      // "stall_reserved" so the creation guard below behaves exactly as it
      // would for a fresh reservation.
      await applyPaymentOutcome(existingPayment.id, "cancelled");
    }
    // failed / cancelled / refunded / partially_refunded: applyPaymentOutcome
    // has already reverted the participation to "stall_reserved" (or, for a
    // refund, to "cancelled" — already rejected by the status guard above) —
    // fall through to open a fresh attempt.
  }

  const { payment, order } = await createOrderForPayment({
    baseAmount: Number(stall.price),
    notes: { exhibitionExhibitorId: participation.id, stallId: stall.id, buyerUserId: req.user!.id },
  });

  // Phase 30 (FP-05): the transaction below returns a discriminated result
  // rather than throwing for its "someone else changed things underneath us"
  // outcomes — throwing inside prisma.$transaction rolls back the WHOLE
  // transaction, including expireStallIfEligible's own writes made earlier
  // in the SAME transaction. Returning normally lets the expiry release
  // commit while still skipping the payment_pending flip and booking
  // creation that follow it.
  const result = await prisma.$transaction(async (tx) => {
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
  res.status(201).json({ booking: result.booking, payment, order });
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
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:view");
  const bookings = businessIds.length
    ? await prisma.stallBooking.findMany({
        where: { exhibitionExhibitor: { exhibitorBusinessId: { in: businessIds } } },
        include: { payment: true, stall: true, exhibition: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

// -------- 10. Payment history for a participation --------

router.get("/:id/payments", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:view");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });

  const bookings = await prisma.stallBooking.findMany({
    where: { exhibitionExhibitorId: participation.id },
    include: { payment: true, stall: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

export default router;