import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { bookingCreationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { createOrderForPayment, pricingBreakdownToPaymentData } from "../lib/paymentService";
import { calculatePricing } from "../lib/pricingEngine";
import { getPaymentProvider } from "../lib/payments";
import { generateQrDataUrl } from "../lib/qrcode";
import { dateString } from "../lib/validation";
import { logAudit } from "../lib/audit";
import {
  lockOrganizerForEntitlement,
  assertCanRegisterVisitor,
  EntitlementError,
  sendEntitlementError,
  logEntitlementBlocked,
  NON_CONSUMING_TICKET_STATUSES,
} from "../lib/entitlementService";

const router = Router();

router.use(requireAuth);

// -------- Ticket bookings --------

// Phase 23.4: MAX_QUANTITY_PER_BOOKING mirrors BookingFlow.tsx's own existing
// `maxQuantity` UX cap (Math.min(10, remaining)) — that frontend cap was
// documented as "UX preview only," but nothing server-side actually enforced
// any ceiling beyond raw stock availability, so a direct API call could
// request an arbitrarily large quantity as long as stock allowed it. This
// isn't inventing a new business rule; it's making the already-chosen UX
// number authoritative, matching this route's own "frontend restrictions are
// UX only, backend must remain authoritative" principle for every other
// field here.
const MAX_QUANTITY_PER_BOOKING = 10;

const createTicketBookingSchema = z.object({
  exhibitionId: z.string(),
  ticketTypeId: z.string(),
  attendeeName: z.string().trim().min(1).max(200),
  attendeeEmail: z.string().trim().email(),
  attendeePhone: z.string().trim().max(20).optional(),
  quantity: z.number().int().positive().max(MAX_QUANTITY_PER_BOOKING),
  visitDate: dateString.optional(),
});

// ---------------------------------------------------------------------------
// Phase 21B (P1-1 fix): idempotent booking creation.
//
// A client sends an "Idempotency-Key" header representing one booking
// INTENT — generated once per attempt to buy a ticket (button click / page
// load), not once per HTTP retry of that same attempt. A refresh, a
// double-click, or a network-retry of the same intent must resolve to the
// exact same booking; a genuinely new purchase must use a new key.
//
// No key present: request proceeds with no dedup protection at all — the
// pre-Phase-21B behavior, preserved deliberately rather than silently
// forced, since older/unmodified clients still exist and refusing them
// outright would just move the dead end from "duplicate booking" to
// "booking blocked."
//
// Same key, same buyer, already used: the ORIGINAL booking is returned as-is
// (200, not 201) — the new request body is never re-validated against the
// old one. This is standard idempotency-key semantics (a la Stripe): the
// key is a promise "resolve this intent exactly once," not a checksum of
// the payload, so a payload that changed under the same key is simply
// ignored in favor of what already happened. Never a security issue, since
// the lookup is scoped to (buyerUserId, idempotencyKey) — no caller can
// read or replay another user's key.
/**
 * A replayed (idempotency-deduplicated) response must still let the client
 * reopen an unresolved payment — returning `order: null` unconditionally
 * would make the frontend treat every replay as "free ticket, already
 * settled" and jump straight to a false confirmation. Reconstructs the same
 * shape createOrderForPayment returns from the persisted Payment row
 * instead of re-creating a second gateway order for the exact same intent.
 */
function buildReplayOrder(payment: { status: string; provider: string | null; providerOrderId: string | null; currency: string } | null) {
  if (!payment || payment.status === "paid" || !payment.providerOrderId) return null;
  const provider = getPaymentProvider();
  return { providerOrderId: payment.providerOrderId, publicKey: provider.publicKey, amount: payment.currency, provider: payment.provider ?? provider.name };
}

/**
 * Phase 21C (P2-3 fix): TicketType.quantity is the total allotment, never
 * decremented on its own — remaining stock is always (quantity - sum of
 * still-consuming bookings), computed fresh here rather than cached
 * anywhere. Previously nothing enforced this at booking time at all (only
 * the organizer-wide visitor-limit entitlement capped total registrations);
 * a ticket type could be oversold without limit. Reuses the exact same
 * "what counts as consumed" status list the visitor-limit entitlement check
 * already uses (NON_CONSUMING_TICKET_STATUSES), so the two capacity
 * concepts never disagree about which bookings count.
 */
class InsufficientStockError extends Error {
  constructor(public remaining: number) {
    super(remaining > 0 ? `Only ${remaining} ticket(s) remaining for this ticket type` : "This ticket type is sold out");
  }
}

async function assertTicketTypeHasStock(tx: Prisma.TransactionClient, ticketTypeId: string, quantityRequested: number): Promise<void> {
  // Row-locked so two concurrent bookings against the last remaining seats
  // of the same ticket type can never both succeed — whichever transaction
  // commits second blocks on this lock until the first releases it, then
  // re-reads the now-updated sold count rather than racing on a stale
  // snapshot (the same pattern lockOrganizerForEntitlement uses).
  const locked = await tx.$queryRaw<{ quantity: number }[]>`SELECT "quantity" FROM "ticket_types" WHERE "id" = ${ticketTypeId} FOR UPDATE`;
  const totalQuantity = locked[0]?.quantity ?? 0;
  const sold = await tx.ticketBooking.aggregate({
    where: { ticketTypeId, paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] } },
    _sum: { quantity: true },
  });
  const remaining = totalQuantity - (sold._sum.quantity ?? 0);
  if (quantityRequested > remaining) {
    throw new InsufficientStockError(remaining);
  }
}

router.post("/tickets", bookingCreationRateLimit, async (req, res) => {
  const parsed = createTicketBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { exhibitionId, ticketTypeId, quantity, visitDate, ...attendee } = parsed.data;

  const idempotencyKeyHeader = req.header("Idempotency-Key");
  const idempotencyKey = idempotencyKeyHeader?.trim() ? idempotencyKeyHeader.trim().slice(0, 200) : null;

  if (idempotencyKey) {
    const existing = await prisma.ticketBooking.findFirst({
      where: { buyerUserId: req.user!.id, idempotencyKey },
      include: { payment: true },
    });
    if (existing) {
      return res.status(200).json({ booking: existing, payment: existing.payment, order: buildReplayOrder(existing.payment), replayed: true });
    }
  }

  // Phase 23.4: `visible: true` was missing here — a hidden ticket type
  // (visible: false, e.g. an organizer-internal/complimentary type not
  // meant to be publicly purchasable) was excluded from every public
  // read (GET /api/public/exhibitions/:id already filters `visible: true`)
  // but was NOT excluded from this write path — a visitor who somehow
  // learned a hidden ticket type's id (it's never rendered, but ids aren't
  // secret) could still POST a real booking against it. Now scoped
  // identically to the public read path.
  const ticketType = await prisma.ticketType.findFirst({
    where: {
      id: ticketTypeId,
      exhibitionId,
      visible: true,
      exhibition: { status: "live", visibility: "public" },
    },
    include: { exhibition: { select: { organizerId: true } } },
  });
  if (!ticketType) return res.status(404).json({ error: "Ticket type not found" });
  const organizerId = ticketType.exhibition.organizerId;

  const unitPrice = Number(ticketType.price);
  const amount = unitPrice * quantity;

  // Free tickets (amount 0) skip the gateway entirely — there is nothing
  // for a signature or webhook to verify, so the Payment is created
  // already "paid" rather than routed through a pointless checkout step.
  // Every priced ticket starts unpaid: a Payment/gateway order is created
  // up front, and the booking only ever reaches paymentStatus "paid" via a
  // verified checkout signature or webhook (see routes/payments.ts,
  // routes/paymentWebhooks.ts) — never from this create call itself.
  const { payment, order } =
    amount === 0
      ? {
          payment: await prisma.payment.create({
            data: {
              ...pricingBreakdownToPaymentData(await calculatePricing(0)),
              currency: "INR",
              provider: "free",
              status: "paid",
            },
          }),
          order: null,
        }
      : await createOrderForPayment({ baseAmount: amount, notes: { exhibitionId, ticketTypeId, buyerUserId: req.user!.id } });

  // The entitlement check + the actual TicketBooking write (the operation
  // that consumes a "visitor" slot) happen together inside one locked
  // transaction, AFTER the payment/gateway order above — never before,
  // since lockOrganizerForEntitlement's lock must never be held across a
  // network call to the payment provider (see that function's own doc
  // comment). The one accepted cost: on the rare race where this
  // organizer's visitor limit fills up between the payment-order call
  // above and this check, the just-created Payment/gateway order is
  // orphaned (never attached to a booking). This is harmless — an unused
  // order for a paid ticket costs nothing and settles nothing; a free
  // ticket's Payment row is a local, no-op record either way — and is the
  // standard, accepted trade-off for not holding a database lock across an
  // external network call.
  try {
    const booking = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, organizerId);
      await assertCanRegisterVisitor(tx, organizerId);
      await assertTicketTypeHasStock(tx, ticketTypeId, quantity);
      return tx.ticketBooking.create({
        data: {
          exhibitionId,
          ticketTypeId,
          buyerUserId: req.user!.id,
          quantity,
          unitPrice,
          amountPaid: amount,
          paymentStatus: amount === 0 ? "paid" : "created",
          paymentId: payment.id,
          idempotencyKey,
          visitDate: visitDate ? new Date(visitDate) : undefined,
          ...attendee,
        },
      });
    });
    // Phase 23.4: no other successful outcome of this route wrote an audit
    // record at all (only the entitlement-blocked failure path did, via
    // logEntitlementBlocked below) — every comparable mutation elsewhere in
    // this codebase (organizer follow/unfollow, event save/unsave, profile
    // updates) logs on success, so a real booking — a far more consequential
    // action than a toggle — should too. Fire-and-forget: logAudit itself
    // never throws back to the caller (see lib/audit.ts), so this can't turn
    // a successful booking into a failed response.
    await logAudit({
      actorUserId: req.user!.id,
      action: "booking.created",
      entityType: "TicketBooking",
      entityId: booking.id,
      metadata: { exhibitionId, ticketTypeId, quantity, amount },
    });
    res.status(201).json({ booking, payment, order });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({ error: err.message, remaining: err.remaining });
    }
    // A concurrent request for the same (buyerUserId, idempotencyKey) intent
    // won the race and created its booking first — the (buyerUserId,
    // idempotencyKey) unique constraint rejects this one. The just-created
    // Payment/gateway order for THIS request is orphaned (same accepted
    // trade-off as the entitlement race above, documented at the top of this
    // handler) — surface the winner's real booking instead of a raw 500.
    if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.ticketBooking.findFirst({
        where: { buyerUserId: req.user!.id, idempotencyKey },
        include: { payment: true },
      });
      if (winner) {
        return res.status(200).json({ booking: winner, payment: winner.payment, order: buildReplayOrder(winner.payment), replayed: true });
      }
    }
    throw err;
  }
});

router.get("/tickets/:id/qr", async (req, res) => {
  const booking = await prisma.ticketBooking.findFirst({
    where: { id: req.params.id, buyerUserId: req.user!.id },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const qrImage = await generateQrDataUrl(booking.qrCode);
  res.json({ qrCode: booking.qrCode, qrImage });
});

router.get("/tickets/mine", async (req, res) => {
  const bookings = await prisma.ticketBooking.findMany({
    where: { buyerUserId: req.user!.id },
    include: { exhibition: true, ticketType: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

// UI-04 — single-ticket detail for the visitor who owns it. Mirrors
// GET /tickets/:id/qr's exact ownership check (buyerUserId from the
// authenticated session, never a client-supplied id) and GET /tickets/mine's
// include shape, so a "ticket details" page has a real endpoint to
// deep-link/refresh against instead of only ever deriving detail from the
// full list client-side. A booking that exists but belongs to someone else
// 404s identically to one that doesn't exist at all — never a 403 — so this
// can't be used to enumerate other visitors' ticket ids.
router.get("/tickets/:id", async (req, res) => {
  const booking = await prisma.ticketBooking.findFirst({
    where: { id: req.params.id, buyerUserId: req.user!.id },
    include: { exhibition: true, ticketType: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking });
});

router.get("/tickets/lookup/:qrCode", requireOrganizerAccess, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "scanner:use");
  const booking = organizerIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { qrCode: req.params.qrCode, exhibition: { organizerId: { in: organizerIds } } },
        include: {
          exhibition: true,
          ticketType: true,
          checkIns: { orderBy: { scannedAt: "desc" }, take: 1, include: { scannedByUser: { select: { fullName: true, email: true } } } },
        },
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking });
});

const checkInSchema = z.object({
  // Re-entry/correction on a ticket that's already checked in. Requires
  // checkin:override (owner/admin only) — a plain scanner cannot self-
  // authorize a duplicate check-in just by retrying.
  force: z.boolean().optional(),
});

router.patch("/tickets/:id/check-in", requireOrganizerAccess, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "scanner:use");
  const booking = organizerIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { id: req.params.id, exhibition: { organizerId: { in: organizerIds } } },
        include: { checkIns: { orderBy: { scannedAt: "desc" }, take: 1, include: { scannedByUser: { select: { fullName: true, email: true } } } } },
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (booking.paymentStatus !== "paid") {
    return res.status(400).json({ error: "This ticket has not been paid for and cannot be checked in" });
  }

  const alreadyCheckedIn = booking.checkInStatus;

  if (alreadyCheckedIn && !parsed.data.force) {
    return res.status(409).json({
      error: "This ticket has already been checked in",
      lastCheckIn: booking.checkIns[0] ?? null,
    });
  }

  if (alreadyCheckedIn && parsed.data.force) {
    const overrideIds = await organizerIdsWithPermission(req.user!, "checkin:override");
    const exhibition = await prisma.exhibition.findUnique({ where: { id: booking.exhibitionId }, select: { organizerId: true } });
    if (!exhibition || !overrideIds.includes(exhibition.organizerId)) {
      return res.status(403).json({ error: "Re-entry after a duplicate check-in requires owner/admin authorization" });
    }
  }

  // Conditional update: only actually transitions checkInStatus false -> true
  // when this is the first check-in, closing the same race window a
  // concurrent double-scan would otherwise hit. A force re-entry always
  // proceeds (it's explicitly re-affirming an already-true state).
  const result = await prisma.$transaction(async (tx) => {
    if (!alreadyCheckedIn) {
      const claimed = await tx.ticketBooking.updateMany({
        where: { id: booking.id, checkInStatus: false },
        data: { checkInStatus: true, checkInTime: new Date() },
      });
      if (claimed.count === 0) throw new Error("RACE_ALREADY_CHECKED_IN");
    }
    const checkIn = await tx.checkIn.create({
      data: {
        ticketBookingId: booking.id,
        scannedByUserId: req.user!.id,
        method: "qr",
        isOverride: alreadyCheckedIn,
      },
    });
    const updatedBooking = await tx.ticketBooking.findUniqueOrThrow({ where: { id: booking.id } });
    return { booking: updatedBooking, checkIn };
  }).catch((err) => {
    if (err instanceof Error && err.message === "RACE_ALREADY_CHECKED_IN") return null;
    throw err;
  });

  if (!result) {
    return res.status(409).json({ error: "This ticket was just checked in by another scan" });
  }

  res.json({ booking: result.booking, checkIn: result.checkIn, wasOverride: alreadyCheckedIn });
});

router.get("/tickets/:id/checkins", requireOrganizerAccess, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "scanner:use");
  const booking = organizerIds.length
    ? await prisma.ticketBooking.findFirst({ where: { id: req.params.id, exhibition: { organizerId: { in: organizerIds } } } })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const checkIns = await prisma.checkIn.findMany({
    where: { ticketBookingId: booking.id },
    include: { scannedByUser: { select: { fullName: true, email: true } } },
    orderBy: { scannedAt: "desc" },
  });
  res.json({ checkIns });
});

router.get("/tickets", requireOrganizerAccess, async (req, res) => {
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const organizerIds = await organizerIdsWithPermission(req.user!, "booking:view");
  const bookings = organizerIds.length
    ? await prisma.ticketBooking.findMany({
        where: {
          exhibition: { organizerId: { in: organizerIds } },
          ...(exhibitionId ? { exhibitionId } : {}),
        },
        include: { exhibition: true, ticketType: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

// -------- Stall bookings --------
//
// There is deliberately no direct "POST /stalls" here anymore. Stalls are
// rented by exhibitor businesses, not purchased by visitors — the old
// endpoint let any authenticated user claim any stall with freeform buyer
// text, bypassing organizer approval entirely (the "direct exhibitor to
// exhibition ownership" bug). A stall booking can now only be created via
// the exhibitor participation workflow (see exhibitorParticipations.ts:
// POST /api/exhibitor/participations/:id/stall, then .../payment), which
// requires an approved application first.

router.get("/stalls/mine", async (req, res) => {
  const bookings = await prisma.stallBooking.findMany({
    where: { buyerUserId: req.user!.id },
    include: { exhibition: true, stall: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

router.get("/stalls", requireOrganizerAccess, async (req, res) => {
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const organizerIds = await organizerIdsWithPermission(req.user!, "booking:view");
  const bookings = organizerIds.length
    ? await prisma.stallBooking.findMany({
        where: {
          exhibition: { organizerId: { in: organizerIds } },
          ...(exhibitionId ? { exhibitionId } : {}),
        },
        include: { exhibition: true, stall: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

export default router;
