import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { getPaymentProvider } from "../src/lib/payments";
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
let paidTicketTypeId: string;
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
  const selectedTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { id: selectedTicketTypeId },
    select: { price: true, currency: true },
  });
  return prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: selectedTicketTypeId,
      userId,
      attendeeName: "Test Attendee",
      attendeeEmail: emails.visitorA,
      quantity: 1,
      unitPrice: selectedTicketType.price,
      currency: selectedTicketType.currency,
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
  paidTicketTypeId = paidTicketType.id;
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

test("GET /event-tickets — issued ticket list, detail and QR are purchaser-scoped", async () => {
  const visitor = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorA },
    select: { id: true },
  });
  const reservation = await createReservation(visitor.id);
  const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
    },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const orderBody = await orderResponse.json();
  assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
  assert.equal(orderBody.order.status, "PAID", "a free order should issue its tickets immediately");

  const issued = await prisma.eventTicket.findMany({
    where: { eventTicketOrderId: orderBody.order.id },
    select: { id: true },
  });
  assert.equal(issued.length, 1, "the paid order should issue exactly one EventTicket");
  const ticketId = issued[0].id;
  const ownerHeaders = { Authorization: `Bearer ${visitorAToken}` };
  const otherHeaders = { Authorization: `Bearer ${visitorBToken}` };

  const ownerMine = await fetch(`${baseUrl}/api/event-tickets/mine`, { headers: ownerHeaders });
  assert.equal(ownerMine.status, 200, await ownerMine.clone().text());
  const ownerMineBody = await ownerMine.json() as { tickets: Array<{ id: string; attendeeEmail: string }> };
  assert.ok(ownerMineBody.tickets.some((ticket) => ticket.id === ticketId && ticket.attendeeEmail === emails.visitorA));

  const otherMine = await fetch(`${baseUrl}/api/event-tickets/mine`, { headers: otherHeaders });
  assert.equal(otherMine.status, 200, await otherMine.clone().text());
  const otherMineBody = await otherMine.json() as { tickets: Array<{ id: string }> };
  assert.ok(otherMineBody.tickets.every((ticket) => ticket.id !== ticketId), "another visitor's issued ticket must not appear in the list");

  const ownerDetail = await fetch(`${baseUrl}/api/event-tickets/${ticketId}`, { headers: ownerHeaders });
  assert.equal(ownerDetail.status, 200, await ownerDetail.clone().text());
  assert.equal((await ownerDetail.json()).ticket.id, ticketId);

  const otherDetail = await fetch(`${baseUrl}/api/event-tickets/${ticketId}`, { headers: otherHeaders });
  assert.equal(otherDetail.status, 404, "another visitor must not read an issued ticket by ID");

  const ownerQr = await fetch(`${baseUrl}/api/event-tickets/${ticketId}/qr`, { headers: ownerHeaders });
  assert.equal(ownerQr.status, 200, await ownerQr.clone().text());
  const ownerQrBody = await ownerQr.json() as { ticketId: string; payload: string };
  assert.equal(ownerQrBody.ticketId, ticketId);
  assert.match(ownerQrBody.payload, /^ETX1\\./, "the owner receives the signed Event ticket QR payload");

  const otherQr = await fetch(`${baseUrl}/api/event-tickets/${ticketId}/qr`, { headers: otherHeaders });
  assert.equal(otherQr.status, 404, "another visitor must not obtain the issued ticket QR");

  for (const path of [
    "/api/event-tickets/mine",
    `/api/event-tickets/${ticketId}`,
    `/api/event-tickets/${ticketId}/qr`,
  ]) {
    const unauthenticated = await fetch(`${baseUrl}${path}`);
    assert.equal(unauthenticated.status, 401, `${path} must reject unauthenticated access`);
  }
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

test("POST /event-ticket-orders — provider initialization failure atomically releases the reservation and cannot replay as success", async () => {
  const visitor = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorA },
    select: { id: true },
  });
  const reservation = await createReservation(visitor.id, paidTicketTypeId);
  const idempotencyKey = `order-provider-failure-${ts}`;
  const provider = getPaymentProvider();
  const originalCreateOrder = provider.createOrder.bind(provider);
  provider.createOrder = async () => {
    throw new Error("simulated provider order initialization failure");
  };

  try {
    const response = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${visitorAToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ reservationId: reservation.id }),
    });
    const body = await response.json();
    assert.equal(response.status, 502, JSON.stringify(body));
    assert.equal(body.error.code, "EVENT_TICKET_CHECKOUT_INITIALIZATION_FAILED");

    const order = await prisma.eventTicketOrder.findUniqueOrThrow({
      where: { reservationId: reservation.id },
      include: { payment: true, reservation: true },
    });
    assert.equal(order.status, "FAILED");
    assert.equal(order.payment.status, "failed");
    assert.equal(order.reservation.status, "CANCELLED",
      "a failed provider initialization must release the inventory hold");

    const replayResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${visitorAToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ reservationId: reservation.id }),
    });
    const replay = await replayResponse.json();
    assert.equal(replayResponse.status, 409, JSON.stringify(replay));
    assert.equal(replay.error.code, "EVENT_TICKET_ORDER_NOT_RETRYABLE");
    assert.equal(
      await prisma.eventTicketOrder.count({ where: { reservationId: reservation.id } }),
      1,
      "a failed attempt must not create a second order on replay",
    );
  } finally {
    provider.createOrder = originalCreateOrder;
  }
});

test("POST /event-ticket-orders — a failed payment replay is not returned as a successful empty checkout", async () => {
  const visitor = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorA },
    select: { id: true },
  });
  const reservation = await createReservation(visitor.id, paidTicketTypeId);
  const idempotencyKey = `order-payment-failed-${ts}`;
  const firstResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201, JSON.stringify(first));

  const failedResponse = await fetch(`${baseUrl}/api/payments/${first.payment.id}/mock-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
    },
    body: JSON.stringify({ outcome: "failure" }),
  });
  const failed = await failedResponse.json();
  assert.equal(failedResponse.status, 200, JSON.stringify(failed));
  assert.equal(failed.payment.status, "failed");

  const replayResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorAToken}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 409, JSON.stringify(replay));
  assert.equal(replay.error.code, "EVENT_TICKET_ORDER_NOT_RETRYABLE");
  assert.equal(
    await prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservation.id } }).then((row) => row.status),
    "CANCELLED",
  );
});

test("POST /event-ticket-orders — replay of a pending order whose reservation expired is not returned as live checkout", async () => {
  const visitor = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorA },
    select: { id: true },
  });
  const sendOrder = (reservationId: string, idempotencyKey: string) =>
    fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${visitorAToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ reservationId }),
    });

  // Case 1: the sweeper has already marked the reservation EXPIRED.
  const swept = await createReservation(visitor.id, paidTicketTypeId);
  const sweptKey = `order-replay-swept-${ts}`;
  const sweptFirst = await sendOrder(swept.id, sweptKey);
  assert.equal(sweptFirst.status, 201, JSON.stringify(await sweptFirst.clone().json()));
  await prisma.eventTicketReservation.update({
    where: { id: swept.id },
    data: { status: "EXPIRED" },
  });
  const sweptReplay = await sendOrder(swept.id, sweptKey);
  const sweptBody = await sweptReplay.json();
  assert.equal(sweptReplay.status, 409, JSON.stringify(sweptBody));
  assert.equal(sweptBody.error.code, "EVENT_TICKET_ORDER_NOT_RETRYABLE");
  assert.equal(sweptBody.checkout, undefined, "an expired hold must not expose checkout details");

  // Case 2: the TTL has elapsed but the sweeper has not run yet (still ACTIVE).
  const elapsed = await createReservation(visitor.id, paidTicketTypeId);
  const elapsedKey = `order-replay-elapsed-${ts}`;
  const elapsedFirst = await sendOrder(elapsed.id, elapsedKey);
  assert.equal(elapsedFirst.status, 201, JSON.stringify(await elapsedFirst.clone().json()));
  await prisma.eventTicketReservation.update({
    where: { id: elapsed.id },
    data: { expiresAt: new Date(Date.now() - 1_000) },
  });
  const elapsedReplay = await sendOrder(elapsed.id, elapsedKey);
  const elapsedBody = await elapsedReplay.json();
  assert.equal(elapsedReplay.status, 409, JSON.stringify(elapsedBody));
  assert.equal(elapsedBody.error.code, "EVENT_TICKET_ORDER_NOT_RETRYABLE");
  assert.equal(elapsedBody.checkout, undefined);

  // Neither replay may create another order or payment for these reservations.
  assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId: { in: [swept.id, elapsed.id] } } }), 2);
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


test("GET /api/event-tickets/:id and /qr — universal issued tickets are isolated to their owner", async () => {
  const createOrder = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${visitorBToken}`,
    },
    body: JSON.stringify({ reservationId: reservationBId }),
  });
  const orderBody = await createOrder.json();
  assert.equal(createOrder.status, 201, JSON.stringify(orderBody));
  assert.equal(orderBody.order.status, "PAID", "free ticket order should be paid immediately");

  const issuedTicket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: orderBody.order.id },
    select: { id: true, userId: true, status: true },
  });
  assert.equal(issuedTicket.userId, (await prisma.user.findUniqueOrThrow({ where: { email: emails.visitorB }, select: { id: true } })).id);
  assert.equal(issuedTicket.status, "ACTIVE");

  const ownerHeaders = { Authorization: `Bearer ${visitorBToken}` };
  const otherHeaders = { Authorization: `Bearer ${visitorAToken}` };

  const ownerDetail = await fetch(`${baseUrl}/api/event-tickets/${issuedTicket.id}`, { headers: ownerHeaders });
  assert.equal(ownerDetail.status, 200, "ticket owner can read the universal ticket detail");

  const otherDetail = await fetch(`${baseUrl}/api/event-tickets/${issuedTicket.id}`, { headers: otherHeaders });
  assert.equal(otherDetail.status, 404, "another visitor cannot read universal ticket detail by ID");

  const ownerQr = await fetch(`${baseUrl}/api/event-tickets/${issuedTicket.id}/qr`, { headers: ownerHeaders });
  assert.equal(ownerQr.status, 200, "ticket owner can retrieve the universal ticket QR");
  const ownerQrBody = await ownerQr.json();
  assert.equal(ownerQrBody.ticketId, issuedTicket.id);
  assert.match(ownerQrBody.qrImage, /^data:image\/png;base64,/);

  const otherQr = await fetch(`${baseUrl}/api/event-tickets/${issuedTicket.id}/qr`, { headers: otherHeaders });
  assert.equal(otherQr.status, 404, "another visitor cannot retrieve universal ticket QR data");

  const otherMine = await fetch(`${baseUrl}/api/event-tickets/mine`, { headers: otherHeaders });
  assert.equal(otherMine.status, 200);
  const otherMineBody = await otherMine.json() as { tickets: Array<{ id: string }> };
  assert.ok(otherMineBody.tickets.every((ticket) => ticket.id !== issuedTicket.id), "My Tickets must exclude another visitor's issued ticket");
});

test("GET /event-ticket-orders/mine — each visitor sees only their own orders and payment records", async () => {
  const visitorA = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorA },
    select: { id: true },
  });
  const visitorB = await prisma.user.findUniqueOrThrow({
    where: { email: emails.visitorB },
    select: { id: true },
  });

  const reservationA = await createReservation(visitorA.id);
  const reservationB = await createReservation(visitorB.id);

  const createFreeOrder = async (token: string, reservationId: string) => {
    const response = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reservationId }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.order.status, "PAID", "free ticket orders should complete without a provider checkout");
    return body as {
      order: { id: string; userId: string; paymentId: string };
      payment: { id: string; status: string };
    };
  };

  const orderA = await createFreeOrder(visitorAToken, reservationA.id);
  const orderB = await createFreeOrder(visitorBToken, reservationB.id);
  assert.equal(orderA.order.userId, visitorA.id);
  assert.equal(orderB.order.userId, visitorB.id);

  const [visitorAMineResponse, visitorBMineResponse] = await Promise.all([
    fetch(`${baseUrl}/api/event-ticket-orders/mine`, {
      headers: { Authorization: `Bearer ${visitorAToken}` },
    }),
    fetch(`${baseUrl}/api/event-ticket-orders/mine`, {
      headers: { Authorization: `Bearer ${visitorBToken}` },
    }),
  ]);
  assert.equal(visitorAMineResponse.status, 200);
  assert.equal(visitorBMineResponse.status, 200);

  type MineBody = {
    orders: Array<{
      id: string;
      userId: string;
      payment: { id: string };
      reservation: { id: string };
    }>;
  };
  const visitorAMine = (await visitorAMineResponse.json()) as MineBody;
  const visitorBMine = (await visitorBMineResponse.json()) as MineBody;

  assert.ok(visitorAMine.orders.some((order) => order.id === orderA.order.id));
  assert.ok(visitorBMine.orders.some((order) => order.id === orderB.order.id));
  assert.ok(visitorAMine.orders.every((order) => order.userId === visitorA.id));
  assert.ok(visitorBMine.orders.every((order) => order.userId === visitorB.id));
  assert.ok(visitorAMine.orders.every((order) => order.id !== orderB.order.id));
  assert.ok(visitorBMine.orders.every((order) => order.id !== orderA.order.id));
  assert.ok(visitorAMine.orders.every((order) => order.payment.id !== orderB.payment.id));
  assert.ok(visitorBMine.orders.every((order) => order.payment.id !== orderA.payment.id));
  assert.ok(visitorAMine.orders.every((order) => order.reservation.id !== reservationB.id));
  assert.ok(visitorBMine.orders.every((order) => order.reservation.id !== reservationA.id));

  const unauthenticated = await fetch(`${baseUrl}/api/event-ticket-orders/mine`);
  assert.equal(unauthenticated.status, 401);
});
