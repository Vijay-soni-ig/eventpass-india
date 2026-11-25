import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  assertLegacyTicketInventoryAvailable,
  getEventTicketInventoryUsage,
  getLegacyTicketInventoryUsage,
  InsufficientTicketInventoryError,
} from "../src/lib/ticketInventory";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
let organizer: Awaited<ReturnType<typeof bootstrapOrganizer>> | null = null;
let eventId: string;
let exhibitionId: string;
let legacyTicketTypeId: string;
const reservationIds: string[] = [];
const orderIds: string[] = [];
const paymentIds: string[] = [];
const bookingIds: string[] = [];

const auth = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  organizer = await bootstrapOrganizer(baseUrl, "unified-ticket-inventory", ts);
  exhibitionId = organizer.firstExhibitionId;

  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: exhibitionId },
    select: { eventId: true },
  });
  if (!exhibition.eventId) throw new Error("The fixture Exhibition must have a linked Event");
  eventId = exhibition.eventId;

  const ticketType = await prisma.ticketType.findFirstOrThrow({ where: { exhibitionId } });
  legacyTicketTypeId = ticketType.id;

  const update = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets/${ticketType.id}`, {
    method: "PUT",
    headers: auth(organizer.token),
    body: JSON.stringify({ quantity: 20 }),
  });
  const updateBody = await update.json();
  assert.equal(update.status, 200, JSON.stringify(updateBody));

  const mirror = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId },
  });
  assert.equal(mirror.eventId, eventId);
  assert.equal(mirror.capacity, 20);
});

after(async () => {
  if (orderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
  if (reservationIds.length) await prisma.eventTicketReservation.deleteMany({ where: { id: { in: reservationIds } } });
  if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  if (bookingIds.length) await prisma.ticketBooking.deleteMany({ where: { id: { in: bookingIds } } });
  if (organizer) await cleanupOrganizers([organizer.organizerId]);
  await stop();
  await prisma.$disconnect();
});

async function addLegacyBooking(paymentStatus: "created" | "pending" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded", quantity: number) {
  if (!organizer) throw new Error("Organizer fixture was not initialized");
  const booking = await prisma.ticketBooking.create({
    data: {
      exhibitionId,
      ticketTypeId: legacyTicketTypeId,
      buyerUserId: organizer.userId,
      attendeeName: "Inventory history",
      attendeeEmail: organizer.email,
      quantity,
      unitPrice: 0,
      amountPaid: 0,
      paymentStatus,
    },
  });
  bookingIds.push(booking.id);
}

async function addEventReservation(params: {
  label: string;
  quantity: number;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "CONVERTED";
  expiresAt: Date;
  orderStatus?: "PAYMENT_PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  paymentStatus?: "created" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";
  refundedAmount?: number;
}) {
  if (!organizer) throw new Error("Organizer fixture was not initialized");
  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId },
    select: { id: true },
  });
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: eventTicketType.id,
      userId: organizer.userId,
      attendeeName: `Inventory ${params.label}`,
      attendeeEmail: organizer.email,
      quantity: params.quantity,
      unitPrice: 100,
      currency: "INR",
      status: params.status,
      expiresAt: params.expiresAt,
    },
  });
  reservationIds.push(reservation.id);

  if (params.orderStatus) {
    if (!params.paymentStatus) throw new Error("Order fixtures require a payment status");
    const pricingVersion = await prisma.pricingVersion.findFirstOrThrow({
      where: { active: true, effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    const amount = params.quantity * 100;
    const payment = await prisma.payment.create({
      data: {
        amount,
        baseAmount: amount,
        organizerAmount: amount,
        refundedAmount: params.refundedAmount ?? 0,
        pricingVersionId: pricingVersion.id,
        provider: "inventory-test",
        status: params.paymentStatus,
      },
    });
    paymentIds.push(payment.id);

    const order = await prisma.eventTicketOrder.create({
      data: {
        eventId,
        reservationId: reservation.id,
        userId: organizer.userId,
        paymentId: payment.id,
        quantity: params.quantity,
        unitPrice: 100,
        subtotal: amount,
        totalAmount: amount,
        currency: "INR",
        status: params.orderStatus,
      },
    });
    orderIds.push(order.id);
  }
}

test("mapped Exhibition inventory reconciles legacy bookings, Event holds, orders, refunds, and concurrent final-ticket claims", async () => {
  if (!organizer) throw new Error("Organizer fixture was not initialized");

  // Preserve the legacy contract: only failed/refunded bookings release stock.
  // In particular, created, pending, partially_refunded, and cancelled rows
  // remain consuming until a separate legacy cancellation policy is designed.
  await addLegacyBooking("paid", 2);
  await addLegacyBooking("created", 1);
  await addLegacyBooking("pending", 1);
  await addLegacyBooking("partially_refunded", 1);
  await addLegacyBooking("cancelled", 1);
  await addLegacyBooking("failed", 4);
  await addLegacyBooking("refunded", 4);

  const future = new Date(Date.now() + 5 * 60_000);
  const past = new Date(Date.now() - 60_000);

  await addEventReservation({ label: "active-without-order", quantity: 1, status: "ACTIVE", expiresAt: future });
  await addEventReservation({
    label: "pending-order-hold",
    quantity: 1,
    status: "ACTIVE",
    expiresAt: future,
    orderStatus: "PAYMENT_PENDING",
    paymentStatus: "created",
  });
  await addEventReservation({
    label: "provider-order-failed-but-hold-active",
    quantity: 1,
    status: "ACTIVE",
    expiresAt: future,
    orderStatus: "FAILED",
    paymentStatus: "failed",
  });
  await addEventReservation({
    label: "paid-order",
    quantity: 3,
    status: "CONVERTED",
    expiresAt: future,
    orderStatus: "PAID",
    paymentStatus: "paid",
  });
  await addEventReservation({
    label: "partially-refunded-order",
    quantity: 4,
    status: "CONVERTED",
    expiresAt: future,
    orderStatus: "PAID",
    paymentStatus: "partially_refunded",
    refundedAmount: 100,
  });
  await addEventReservation({ label: "expired-hold", quantity: 3, status: "ACTIVE", expiresAt: past });
  await addEventReservation({ label: "cancelled-hold", quantity: 3, status: "CANCELLED", expiresAt: future });
  await addEventReservation({
    label: "failed-order",
    quantity: 5,
    status: "CANCELLED",
    expiresAt: future,
    orderStatus: "FAILED",
    paymentStatus: "failed",
  });
  await addEventReservation({
    label: "cancelled-order",
    quantity: 5,
    status: "CANCELLED",
    expiresAt: future,
    orderStatus: "CANCELLED",
    paymentStatus: "cancelled",
  });
  await addEventReservation({
    label: "fully-refunded-order",
    quantity: 5,
    status: "CONVERTED",
    expiresAt: future,
    orderStatus: "REFUNDED",
    paymentStatus: "refunded",
    refundedAmount: 500,
  });

  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId },
  });
  const now = new Date();
  const eventUsage = await getEventTicketInventoryUsage(prisma, [eventTicketType.id], now);
  const legacyUsage = await getLegacyTicketInventoryUsage(prisma, [legacyTicketTypeId], now);

  assert.deepEqual(eventUsage.get(eventTicketType.id), {
    legacyBookings: 6,
    activeReservations: 3,
    paidOrders: 7,
    consumed: 16,
  });
  assert.deepEqual(legacyUsage.get(legacyTicketTypeId), eventUsage.get(eventTicketType.id));

  const publicResponse = await fetch(`${baseUrl}/api/public/events/${eventId}/tickets`);
  const publicBody = await publicResponse.json();
  assert.equal(publicResponse.status, 200, JSON.stringify(publicBody));
  const publicTicket = publicBody.ticketTypes.find((ticket: { id: string }) => ticket.id === legacyTicketTypeId);
  assert.ok(publicTicket, "the linked Exhibition ticket must remain publicly readable");
  assert.equal(publicTicket.remaining, 4, "public remaining stock must include both legacy and Event inventory");

  // Both writers take Event -> EventTicketType -> TicketType locks. Exactly
  // one transaction can claim three of the final four seats; the loser must
  // observe the winner's committed TicketBooking and report one remaining.
  const attempt = (key: string) => prisma.$transaction(async (tx) => {
    const remaining = await assertLegacyTicketInventoryAvailable(tx, legacyTicketTypeId, 3);
    const booking = await tx.ticketBooking.create({
      data: {
        exhibitionId,
        ticketTypeId: legacyTicketTypeId,
        buyerUserId: organizer.userId,
        attendeeName: `Concurrent ${key}`,
        attendeeEmail: organizer.email,
        quantity: 3,
        unitPrice: 0,
        amountPaid: 0,
        paymentStatus: "paid",
        idempotencyKey: `inventory-${ts}-${key}`,
      },
    });
    return { bookingId: booking.id, remainingBeforeClaim: remaining };
  }).then((result) => ({ ok: true as const, ...result })).catch((error: unknown) => {
    if (error instanceof InsufficientTicketInventoryError) {
      return { ok: false as const, remaining: error.remaining };
    }
    throw error;
  });

  const results = await Promise.all([attempt("a"), attempt("b")]);
  const winners = results.filter((result) => result.ok);
  const losers = results.filter((result) => !result.ok);
  assert.equal(winners.length, 1, "only one concurrent transaction may claim the remaining inventory");
  assert.equal(losers.length, 1, "the competing transaction must be rejected");
  assert.equal(losers[0].remaining, 1);
  bookingIds.push(winners[0].bookingId);

  const finalUsage = await getLegacyTicketInventoryUsage(prisma, [legacyTicketTypeId]);
  assert.equal(finalUsage.get(legacyTicketTypeId)?.consumed, 19);
  const finalPublicResponse = await fetch(`${baseUrl}/api/public/events/${eventId}/tickets`);
  const finalPublicBody = await finalPublicResponse.json();
  assert.equal(finalPublicResponse.status, 200, JSON.stringify(finalPublicBody));
  assert.equal(
    finalPublicBody.ticketTypes.find((ticket: { id: string }) => ticket.id === legacyTicketTypeId)?.remaining,
    1,
    "public availability must agree with the serialized write path",
  );
});
