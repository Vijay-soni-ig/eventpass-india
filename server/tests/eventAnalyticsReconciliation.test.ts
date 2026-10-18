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
    if (createdTicketIds.length) await prisma.eventTicketCheckIn.deleteMany({ where: { eventTicketId: { in: createdTicketIds } } });
    if (createdTicketIds.length) await prisma.eventTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
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
    prisma.eventTicketOrder.aggregate({ where: { eventId, status: "PAID" }, _sum: { totalAmount: true } }),
    prisma.eventTicketOrder.aggregate({ where: { eventId, status: "REFUNDED" }, _sum: { totalAmount: true } }),
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
  assert.equal(Number(analytics.orders.refundedAmount), Number(refundedRevenue._sum.totalAmount ?? 0));
  assert.equal(analytics.orders.netTicketRevenue, Number(paidRevenue._sum.totalAmount ?? 0) - Number(refundedRevenue._sum.totalAmount ?? 0));
  assert.deepEqual(analytics.ticketTypes, [{
    id: storedTicketType.id,
    name: storedTicketType.name,
    capacity: storedTicketType.capacity,
    price: Number(storedTicketType.price),
    status: storedTicketType.status,
  }]);
});
