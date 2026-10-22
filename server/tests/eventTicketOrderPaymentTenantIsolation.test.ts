import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
let visitorUserId: string | undefined;
let eventId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (eventId) {
    const orders = await prisma.eventTicketOrder.findMany({ where: { eventId }, select: { id: true, paymentId: true } });
    const orderIds = orders.map((order) => order.id);
    const paymentIds = orders.map((order) => order.paymentId);
    if (orderIds.length) await prisma.eventTicket.deleteMany({ where: { eventTicketOrderId: { in: orderIds } } });
    if (orderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
    if (paymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prisma.eventTicketReservation.deleteMany({ where: { eventId } });
    await prisma.eventTicketType.deleteMany({ where: { eventId } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
  }
  if (visitorUserId) await prisma.user.deleteMany({ where: { id: visitorUserId } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("organizer payment detail and refund endpoints isolate universal event-ticket order payments by tenant", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "event-order-payment-owner-" + ts, ts);
  const other = await bootstrapOrganizer(baseUrl, "event-order-payment-other-" + ts, ts + 1);
  organizerIds.push(owner.organizerId, other.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  await setSubscription(other.organizerId, "enterprise", "active");

  const event = await prisma.event.create({
    data: {
      organizerId: owner.organizerId,
      ownerId: owner.userId,
      title: "Universal Event Payment Isolation " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date(),
      endDate: new Date(),
      moduleEnablements: { create: { moduleType: "TICKETING", enabled: true } },
    },
  });
  eventId = event.id;

  const ticketType = await prisma.eventTicketType.create({
    data: { eventId, name: "Paid Test Ticket", price: 500, currency: "INR", capacity: 5, maxPerOrder: 2, status: "ACTIVE" },
  });
  const visitor = await signupUser(baseUrl, "event-order-payment-visitor-" + ts + "@example.com", "Event Payment Visitor", "visitor");
  visitorUserId = visitor.userId;
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketType.id,
      userId: visitor.userId,
      attendeeName: "Event Payment Visitor",
      attendeeEmail: "event-order-payment-visitor-" + ts + "@example.com",
      quantity: 1,
      unitPrice: 500,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const orderResponse = await fetch(baseUrl + "/api/event-ticket-orders", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const orderBody = await orderResponse.json();
  assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
  assert.ok(orderBody.payment?.id, "paid universal ticket order should create a payment");
  const paymentId = orderBody.payment.id as string;

  const detail = await fetch(baseUrl + "/api/organizer/payments/" + paymentId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(detail.status, 404);
  assert.deepEqual(await detail.json(), { error: "Payment not found" });

  const refunds = await fetch(baseUrl + "/api/organizer/payments/" + paymentId + "/refunds", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(refunds.status, 404);

  const refund = await fetch(baseUrl + "/api/organizer/payments/" + paymentId + "/refund", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "CUSTOMER_REQUEST", idempotencyKey: "event-order-cross-tenant-" + ts }),
  });
  assert.equal(refund.status, 404);

  const unchanged = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(unchanged.status, "created", "rejected cross-tenant requests must leave the payment in its original created state");
  assert.equal(Number(unchanged.refundedAmount), 0);
  assert.equal(await prisma.refund.count({ where: { paymentId } }), 0);
});
