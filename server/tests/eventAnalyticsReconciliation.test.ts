import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { cleanupOrganizers } from "./helpers/entitlementFixtures";
import { buildQrPayload } from "../src/lib/eventTicketIssuance";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
const createdEventIds: string[] = [];
const createdOrganizerIds: string[] = [];
const createdReservationIds: string[] = [];
const createdOrderIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdTicketIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    // An order can issue tickets before a later assertion fails. Discover every
    // ticket through the owned test-order IDs so cleanup does not depend on
    // whether the test reached the line that records each issued ticket ID.
    const cleanupTicketIds = new Set(createdTicketIds);
    if (createdOrderIds.length) {
      const linkedTickets = await prisma.eventTicket.findMany({
        where: { eventTicketOrderId: { in: createdOrderIds } },
        select: { id: true },
      });
      for (const ticket of linkedTickets) cleanupTicketIds.add(ticket.id);
    }
    const ticketIds = [...cleanupTicketIds];
    if (ticketIds.length) await prisma.eventTicketCheckIn.deleteMany({ where: { eventTicketId: { in: ticketIds } } });
    if (ticketIds.length) await prisma.eventTicket.deleteMany({ where: { id: { in: ticketIds } } });
    if (createdOrderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
    if (createdPaymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: createdPaymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    }
    if (createdReservationIds.length) await prisma.eventTicketReservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    if (createdEventIds.length) await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    if (createdOrganizerIds.length) await cleanupOrganizers(createdOrganizerIds);
  } finally {
    await stop();
  }
});

const auth = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

test("Universal Event analytics reconciles registration and ticket totals with persisted records", async () => {
  const email = `event-analytics-reconcile-${ts}@example.com`;
  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-analytics-reconcile-${ts}` },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Analytics Reconciliation Organizer",
      userType: "exhibitor",
    }),
  });
  assert.equal(signupResponse.status, 201, await signupResponse.clone().text());
  const signup = await signupResponse.json() as { token: string; user: { id: string } };

  // Use the supported onboarding path to establish organizer ownership.
  const exhibitionResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({
      name: `Analytics reconciliation bootstrap ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201, await exhibitionResponse.clone().text());
  const exhibitionBody = await exhibitionResponse.json() as { exhibition: { id: string; organizerId: string } };
  createdOrganizerIds.push(exhibitionBody.exhibition.organizerId);

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Analytics reconciliation ${ts}`,
      status: "DRAFT",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Test venue",
    }),
  });
  assert.equal(eventResponse.status, 201, await eventResponse.clone().text());
  const created = await eventResponse.json() as { event: { id: string } };
  const eventId = created.event.id;
  createdEventIds.push(eventId);

  // Exercise the real ticket-order and QR check-in paths, without an external payment provider.
  await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED" } });
  for (const moduleType of ["TICKETING", "CHECK_IN", "ANALYTICS"] as const) {
    await prisma.eventModuleEnablement.upsert({
      where: { eventId_moduleType: { eventId, moduleType } },
      create: { eventId, moduleType, enabled: true },
      update: { enabled: true },
    });
  }

  await prisma.eventRegistration.createMany({
    data: [
      { eventId, fullName: "Confirmed Visitor", email: `confirmed-${ts}@example.com`, status: "CONFIRMED", consentAccepted: true },
      { eventId, fullName: "Pending Visitor", email: `pending-${ts}@example.com`, status: "PENDING", consentAccepted: true },
      { eventId, fullName: "Cancelled Visitor", email: `cancelled-${ts}@example.com`, status: "CANCELLED", consentAccepted: true },
    ],
  });

  const ticketType = await prisma.eventTicketType.create({
    data: { eventId, name: "General Admission", capacity: 25, maxPerOrder: 5, price: 0, status: "ACTIVE" },
  });

  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketType.id,
      userId: signup.user.id,
      attendeeName: "Analytics Check-in Visitor",
      attendeeEmail: `analytics-checkin-${ts}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  createdReservationIds.push(reservation.id);

  const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const orderBody = await orderResponse.json() as { order: { id: string; status: string }; payment: { id: string } };
  assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
  assert.equal(orderBody.order.status, "PAID");
  createdOrderIds.push(orderBody.order.id);
  createdPaymentIds.push(orderBody.payment.id);

  const issuedTicket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: orderBody.order.id },
    select: { id: true, ticketCode: true, status: true },
  });
  createdTicketIds.push(issuedTicket.id);
  assert.equal(issuedTicket.status, "ACTIVE");

  const checkInResponse = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({ qrPayload: buildQrPayload(issuedTicket.id, issuedTicket.ticketCode), eventId }),
  });
  assert.equal(checkInResponse.status, 200, await checkInResponse.clone().text());

  const analyticsResponse = await fetch(`${baseUrl}/api/organizer/event-analytics/${eventId}`, {
    headers: { Authorization: `Bearer ${signup.token}` },
  });
  assert.equal(analyticsResponse.status, 200, await analyticsResponse.clone().text());
  const analytics = await analyticsResponse.json() as {
    registrations: { total: number; confirmed: number; pending: number; cancelled: number };
    tickets: { total: number; active: number; used: number; cancelled: number; refunded: number; checkInRate: number };
    checkIns: { total: number };
    orders: { paid: number; refunded: number; grossPaid: number | string; refundedAmount: number | string; netTicketRevenue: number };
    ticketTypes: Array<{ id: string; name: string; capacity: number; price: number; status: string }>;
  };

  const [registrationCounts, ticketCount, checkInCount, paidOrderCount, refundedOrderCount, paidRevenue, refundedRevenue, storedTicketType] = await Promise.all([
    prisma.eventRegistration.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    prisma.eventTicket.count({ where: { eventId } }),
    prisma.eventTicketCheckIn.count({ where: { eventId } }),
    prisma.eventTicketOrder.count({ where: { eventId, status: "PAID" } }),
    prisma.eventTicketOrder.count({ where: { eventId, status: "REFUNDED" } }),
    prisma.eventTicketOrder.aggregate({ where: { eventId, status: { in: ["PAID", "REFUNDED"] } }, _sum: { totalAmount: true } }),
    prisma.payment.aggregate({ where: { eventTicketOrder: { is: { eventId } } }, _sum: { refundedAmount: true } }),
    prisma.eventTicketType.findUniqueOrThrow({ where: { id: ticketType.id } }),
  ]);
  const expected = { total: 0, confirmed: 0, pending: 0, cancelled: 0 };
  for (const row of registrationCounts) {
    expected.total += row._count._all;
    if (row.status === "CONFIRMED") expected.confirmed += row._count._all;
    if (row.status === "PENDING") expected.pending += row._count._all;
    if (row.status === "CANCELLED") expected.cancelled += row._count._all;
  }

  assert.deepEqual(analytics.registrations, expected, "registration status totals must match persisted rows");
  assert.equal(analytics.tickets.total, ticketCount);
  assert.equal(analytics.tickets.total, 1, "analytics must include an actually issued ticket");
  assert.equal(analytics.tickets.used, 1, "a checked-in ticket must be counted as used");
  assert.equal(analytics.tickets.active, 0);
  assert.equal(analytics.tickets.checkInRate, 100, "one used ticket out of one issued ticket is a 100% check-in rate");
  assert.equal(analytics.checkIns.total, checkInCount);
  assert.equal(analytics.checkIns.total, 1, "analytics must include the persisted check-in record");
  assert.equal(analytics.orders.paid, paidOrderCount);
  assert.equal(analytics.orders.refunded, refundedOrderCount);
  assert.equal(Number(analytics.orders.grossPaid), Number(paidRevenue._sum.totalAmount ?? 0));
  assert.equal(Number(analytics.orders.refundedAmount), Number(refundedRevenue._sum.refundedAmount ?? 0));
  assert.equal(analytics.orders.netTicketRevenue, Number(paidRevenue._sum.totalAmount ?? 0) - Number(refundedRevenue._sum.refundedAmount ?? 0));
  assert.deepEqual(analytics.ticketTypes, [{
    id: storedTicketType.id,
    name: storedTicketType.name,
    capacity: storedTicketType.capacity,
    price: Number(storedTicketType.price),
    status: storedTicketType.status,
  }]);
  
  // Reconcile gross revenue against a fully refunded non-zero order. The order
  // must remain in historical gross paid sales and be subtracted exactly once
  // when computing net ticket revenue. This is a database fixture, not a live
  // payment-provider verification.
  const refundReservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketType.id,
      userId: signup.user.id,
      attendeeName: "Analytics Refunded Visitor",
      attendeeEmail: `analytics-refunded-${ts}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  createdReservationIds.push(refundReservation.id);

  const refundOrderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({ reservationId: refundReservation.id }),
  });
  const refundOrderBody = await refundOrderResponse.json() as { order: { id: string; status: string }; payment: { id: string } };
  assert.equal(refundOrderResponse.status, 201, JSON.stringify(refundOrderBody));
  createdOrderIds.push(refundOrderBody.order.id);
  createdPaymentIds.push(refundOrderBody.payment.id);

  const refundedTicket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: refundOrderBody.order.id },
    select: { id: true },
  });
  createdTicketIds.push(refundedTicket.id);

  await prisma.eventTicketReservation.update({
    where: { id: refundReservation.id },
    data: { unitPrice: 1250 },
  });
  await prisma.eventTicketOrder.update({
    where: { id: refundOrderBody.order.id },
    data: { unitPrice: 1250, subtotal: 1250, totalAmount: 1250, status: "REFUNDED" },
  });
  await prisma.payment.update({
    where: { id: refundOrderBody.payment.id },
    data: {
      amount: 1250,
      baseAmount: 1250,
      organizerAmount: 1250,
      refundedAmount: 1250,
      status: "refunded",
    },
  });
  await prisma.eventTicket.update({
    where: { id: refundedTicket.id },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  await prisma.refund.create({
    data: {
      paymentId: refundOrderBody.payment.id,
      amount: 1250,
      status: "SUCCEEDED",
      reason: "CUSTOMER_REQUEST",
      idempotencyKey: `analytics-refund-${ts}`,
      provider: "mock",
      completedAt: new Date(),
    },
  });

  // A partial refund leaves the order PAID. Its refunded amount must still
  // be included in the refund total without removing the order from gross sales.
  const partialReservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketType.id,
      userId: signup.user.id,
      attendeeName: "Analytics Partially Refunded Visitor",
      attendeeEmail: `analytics-partial-refund-${ts}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  createdReservationIds.push(partialReservation.id);

  const partialOrderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: auth(signup.token),
    body: JSON.stringify({ reservationId: partialReservation.id }),
  });
  const partialOrderBody = await partialOrderResponse.json() as { order: { id: string; status: string }; payment: { id: string } };
  assert.equal(partialOrderResponse.status, 201, JSON.stringify(partialOrderBody));
  createdOrderIds.push(partialOrderBody.order.id);
  createdPaymentIds.push(partialOrderBody.payment.id);

  await prisma.eventTicketReservation.update({
    where: { id: partialReservation.id },
    data: { unitPrice: 2000 },
  });
  await prisma.eventTicketOrder.update({
    where: { id: partialOrderBody.order.id },
    data: { unitPrice: 2000, subtotal: 2000, totalAmount: 2000, status: "PAID" },
  });
  await prisma.payment.update({
    where: { id: partialOrderBody.payment.id },
    data: {
      amount: 2000,
      baseAmount: 2000,
      organizerAmount: 2000,
      refundedAmount: 500,
      status: "paid",
    },
  });
  await prisma.refund.create({
    data: {
      paymentId: partialOrderBody.payment.id,
      amount: 500,
      status: "SUCCEEDED",
      reason: "CUSTOMER_REQUEST",
      idempotencyKey: `analytics-partial-refund-${ts}`,
      provider: "mock",
      completedAt: new Date(),
    },
  });

  const refundedAnalyticsResponse = await fetch(`${baseUrl}/api/organizer/event-analytics/${eventId}`, {
    headers: { Authorization: `Bearer ${signup.token}` },
  });
  assert.equal(refundedAnalyticsResponse.status, 200, await refundedAnalyticsResponse.clone().text());
  const refundedAnalytics = await refundedAnalyticsResponse.json() as {
    orders: { paid: number; refunded: number; grossPaid: number | string; refundedAmount: number | string; netTicketRevenue: number };
  };
  assert.equal(refundedAnalytics.orders.paid, 2, "the original free order and partially refunded order remain PAID");
  assert.equal(refundedAnalytics.orders.refunded, 1, "the fully refunded order is counted separately");
  assert.equal(Number(refundedAnalytics.orders.grossPaid), 3250, "gross paid sales retain fully and partially refunded orders");
  assert.equal(Number(refundedAnalytics.orders.refundedAmount), 1750, "refund total includes full ₹1,250 and partial ₹500 refunds");
  assert.equal(refundedAnalytics.orders.netTicketRevenue, 1500, "net revenue subtracts full and partial refunds exactly once");

});
