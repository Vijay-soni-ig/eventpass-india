import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

const ts = Date.now();
const password = "TestPassword123!";
const emails = {
  organizer: `rbac-order-organizer-${ts}@example.com`,
  visitorA: `rbac-order-a-${ts}@example.com`,
  visitorB: `rbac-order-b-${ts}@example.com`,
};

let organizerId: string;
let eventId: string;
let ticketTypeId: string;
let reservationAId: string;
let reservationBId: string;
let reservationASecondId: string;
let paidReservationId: string;
let visitorAToken: string;
let visitorBToken: string;

async function signup(email: string, userType: "visitor" | "organizer") {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fullName: userType === "organizer" ? "RBAC Order Organizer" : email.split("@")[0],
      userType,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return { id: body.user.id as string, token: body.token as string };
}

async function createReservation(userId: string, selectedTicketTypeId = ticketTypeId) {
  return prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: selectedTicketTypeId,
      userId,
      attendeeName: "Test Attendee",
      attendeeEmail: emails.visitorA,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());

  const organizer = await signup(emails.organizer, "organizer");
  const organizerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.id, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  organizerId = organizerMembership.organizerId;

  const visitorA = await signup(emails.visitorA, "visitor");
  const visitorB = await signup(emails.visitorB, "visitor");
  visitorAToken = visitorA.token;
  visitorBToken = visitorB.token;

  const event = await prisma.event.create({
    data: {
      organizerId,
      ownerId: organizer.id,
      title: "RBAC Event Ticket Order Test",
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date(),
      endDate: new Date(),
      moduleEnablements: {
        create: { moduleType: "TICKETING", enabled: true },
      },
    },
  });
  eventId = event.id;

  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId,
      name: "Free Test Ticket",
      price: 0,
      currency: "INR",
      capacity: 10,
      maxPerOrder: 2,
      status: "ACTIVE",
    },
  });
  ticketTypeId = ticketType.id;

  const paidTicketType = await prisma.eventTicketType.create({
    data: {
      eventId,
      name: "Paid Test Ticket",
      price: 500,
      currency: "INR",
      capacity: 10,
      maxPerOrder: 2,
      status: "ACTIVE",
    },
  });
  const [reservationA, reservationB, reservationASecond, paidReservation] = await Promise.all([
    createReservation(visitorA.id),
    createReservation(visitorB.id),
    createReservation(visitorA.id),
    createReservation(visitorA.id, paidTicketType.id),
  ]);
  reservationAId = reservationA.id;
  reservationBId = reservationB.id;
  reservationASecondId = reservationASecond.id;
  paidReservationId = paidReservation.id;
});

after(async () => {
  try {
    if (eventId) {
      const paymentIds = await prisma.eventTicketOrder
        .findMany({ where: { eventId }, select: { paymentId: true } })
        .then((rows) => rows.map((row) => row.paymentId));

      const orderIds = await prisma.eventTicketOrder
        .findMany({ where: { eventId }, select: { id: true } })
        .then((rows) => rows.map((row) => row.id));
      if (orderIds.length > 0) {
        await prisma.eventTicket.deleteMany({ where: { eventTicketOrderId: { in: orderIds } } });
        await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (paymentIds.length > 0) {
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }
      await prisma.eventTicketReservation.deleteMany({ where: { eventId } });
      await prisma.eventTicketType.deleteMany({ where: { eventId } });
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }

    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  } finally {
    await stop();
  }
});

test("POST /event-ticket-orders — reservation owner can create an order", async () => {
  const res = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
    },
    body: JSON.stringify({ reservationId: reservationAId }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.order.userId, (await prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservationAId } })).userId);
  assert.equal(body.order.reservationId, reservationAId);
});

test("POST /event-ticket-orders — same idempotency key replays the same pending order and rejects a different reservation", async () => {
  const idempotencyKey = `order-replay-${ts}`;
  const firstResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reservationId: paidReservationId }),
  });
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201, JSON.stringify(first));
  assert.equal(first.order.status, "PAYMENT_PENDING");
  assert.ok(first.checkout?.providerOrderId);
  assert.equal(first.checkout.amount, 500);

  const replayResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reservationId: paidReservationId }),
  });
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 200, JSON.stringify(replay));
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.id, first.order.id);
  assert.equal(replay.payment.id, first.payment.id);
  assert.deepEqual(replay.checkout, first.checkout);
  assert.equal(
    await prisma.eventTicketOrder.count({ where: { reservationId: paidReservationId } }),
    1,
    "a retry must not create a second order",
  );

  const mismatchedResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reservationId: reservationASecondId }),
  });
  assert.equal(mismatchedResponse.status, 409);
  assert.match((await mismatchedResponse.json()).error, /different reservation/i);
  assert.equal(
    await prisma.eventTicketOrder.count({ where: { reservationId: reservationASecondId } }),
    0,
    "reusing a key for another reservation must not create an order",
  );
});

test("POST /event-ticket-orders — visitor A cannot create an order from visitor B's reservation", async () => {
  const res = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
    },
    body: JSON.stringify({ reservationId: reservationBId }),
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Reservation not found");

  assert.equal(
    await prisma.eventTicketOrder.count({ where: { reservationId: reservationBId } }),
    0,
    "cross-user reservation must not create an order",
  );
});

test("POST /event-ticket-orders — visitor B cannot create an order from visitor A's reservation", async () => {
  const res = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorBToken}`,
    },
    body: JSON.stringify({ reservationId: reservationAId }),
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "Reservation not found");

  assert.equal(
    await prisma.eventTicketOrder.count({ where: { reservationId: reservationAId } }),
    1,
    "cross-user request must not create a second order",
  );
});

test("POST /event-ticket-orders — unauthenticated request is rejected before reservation lookup", async () => {
  const res = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId: reservationBId }),
  });
  assert.equal(res.status, 401);
});
