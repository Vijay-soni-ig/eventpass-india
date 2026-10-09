import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const userIds: string[] = [];
const organizerIds: string[] = [];
const eventIds: string[] = [];
const ticketTypeIds: string[] = [];
const reservationIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (eventIds.length) {
    const orders = await prisma.eventTicketOrder.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true, paymentId: true },
    });
    const orderIds = orders.map((order) => order.id);
    const paymentIds = orders.map((order) => order.paymentId);
    if (orderIds.length) {
      await prisma.eventTicket.deleteMany({ where: { eventTicketOrderId: { in: orderIds } } });
      await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (paymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
  }
  if (reservationIds.length) await prisma.eventTicketReservation.deleteMany({ where: { id: { in: reservationIds } } });
  if (ticketTypeIds.length) await prisma.eventTicketType.deleteMany({ where: { id: { in: ticketTypeIds } } });
  if (eventIds.length) {
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  if (organizerIds.length) {
    await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: organizerIds } } });
    await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

async function signup(email: string, userType: "organizer" | "visitor") {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Reservation Lifecycle Test",
      userType,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { id: body.user.id as string, token: body.token as string };
}

test("reservation cancellation and order creation serialize on the reservation row", async () => {
  const suffix = ts;
  const organizer = await signup(`reservation-race-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`reservation-race-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.id, status: "active" },
  });
  organizerIds.push(membership.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.id,
      title: `Reservation Lifecycle ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  eventIds.push(event.id);

  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Free Lifecycle Ticket",
      price: 0,
      currency: "INR",
      capacity: 2,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });
  ticketTypeIds.push(ticketType.id);

  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId: event.id,
      eventTicketTypeId: ticketType.id,
      userId: visitor.id,
      attendeeName: "Reservation Lifecycle Visitor",
      attendeeEmail: `reservation-race-visitor-${suffix}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  reservationIds.push(reservation.id);

  const [cancelResponse, orderResponse] = await Promise.all([
    fetch(`${baseUrl}/api/event-ticket-reservations/${reservation.id}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${visitor.token}` },
    }),
    fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `reservation-race-order-${suffix}`,
      },
      body: JSON.stringify({ reservationId: reservation.id }),
    }),
  ]);

  assert.ok([200, 409].includes(cancelResponse.status), `unexpected cancellation status ${cancelResponse.status}`);
  assert.ok([201, 409].includes(orderResponse.status), `unexpected order status ${orderResponse.status}`);
  assert.equal(
    [cancelResponse.status, orderResponse.status].filter((status) => status === 409).length,
    1,
    "exactly one competing lifecycle operation must lose",
  );

  const persisted = await prisma.eventTicketReservation.findUniqueOrThrow({
    where: { id: reservation.id },
    include: { order: true },
  });
  const orderCount = await prisma.eventTicketOrder.count({ where: { reservationId: reservation.id } });

  if (persisted.order) {
    assert.equal(orderResponse.status, 201, "the order request must be the winning operation");
    assert.equal(cancelResponse.status, 409, "an existing order prevents reservation cancellation");
    assert.equal(persisted.status, "ACTIVE", "an ordered reservation must remain active for payment reconciliation");
    assert.equal(orderCount, 1);
  } else {
    assert.equal(cancelResponse.status, 200, "cancellation is the winning operation");
    assert.equal(orderResponse.status, 409, "order creation must reject a reservation cancelled first");
    assert.equal(persisted.status, "CANCELLED");
    assert.equal(orderCount, 0);
  }

  const cancellationAuditCount = await prisma.auditLog.count({
    where: { action: "eventTicketReservation.cancelled", entityId: reservation.id, actorUserId: visitor.id },
  });
  assert.equal(cancellationAuditCount, cancelResponse.status === 200 ? 1 : 0);
});
