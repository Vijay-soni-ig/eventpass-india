import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

const ts = Date.now();
const password = "TestPassword123!";
let baseUrl: string;
let stop: () => Promise<void>;
const userIds: string[] = [];
const organizerIds: string[] = [];
const eventIds: string[] = [];
const paymentIds: string[] = [];
const orderIds: string[] = [];
const reservationIds: string[] = [];
const ticketIds: string[] = [];

type User = { id: string; token: string };

async function signup(email: string, userType: "visitor" | "organizer"): Promise<User> {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, fullName: email.split("@")[0], userType }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { id: body.user.id, token: body.token };
}

async function createPaidOrder(owner: User, label: string) {
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: owner.id, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  organizerIds.push(membership.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: owner.id,
      title: `Payment RBAC ${label}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date(),
      endDate: new Date(),
      moduleEnablements: { create: { moduleType: "TICKETING", enabled: true } },
    },
  });
  eventIds.push(event.id);

  const type = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Payment RBAC Test",
      price: 0,
      currency: "INR",
      capacity: 10,
      maxPerOrder: 2,
      status: "ACTIVE",
    },
  });

  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId: event.id,
      eventTicketTypeId: type.id,
      userId: owner.id,
      attendeeName: "Payment RBAC Test",
      attendeeEmail: `${owner.id}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  reservationIds.push(reservation.id);

  const res = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));

  orderIds.push(body.order.id);
  paymentIds.push(body.payment.id);

  const ticket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: body.order.id },
    select: { id: true },
  });
  ticketIds.push(ticket.id);

  return { paymentId: body.payment.id, providerOrderId: body.payment.providerOrderId };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (ticketIds.length) await prisma.eventTicketCheckIn.deleteMany({ where: { eventTicketId: { in: ticketIds } } });
    if (ticketIds.length) await prisma.eventTicket.deleteMany({ where: { id: { in: ticketIds } } });
    if (orderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
    if (paymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    if (reservationIds.length) await prisma.eventTicketReservation.deleteMany({ where: { id: { in: reservationIds } } });
    if (eventIds.length) {
      await prisma.eventTicketType.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    if (organizerIds.length) await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: organizerIds } } });
    if (organizerIds.length) await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await stop();
  }
});

test("payments RBAC: owner can read their payment", async () => {
  const owner = await signup(`payment-owner-${ts}@example.com`, "organizer");
  const fixture = await createPaidOrder(owner, "owner");

  const res = await fetch(`${baseUrl}/api/payments/${fixture.paymentId}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const body = await res.json();

  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.payment.id, fixture.paymentId);
});

test("payments RBAC: another authenticated user cannot read the payment", async () => {
  const owner = await signup(`payment-cross-owner-${ts}@example.com`, "organizer");
  const other = await signup(`payment-cross-user-${ts}@example.com`, "visitor");
  const fixture = await createPaidOrder(owner, "cross-user");

  const res = await fetch(`${baseUrl}/api/payments/${fixture.paymentId}`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  const body = await res.json();

  assert.equal(res.status, 404, JSON.stringify(body));
  assert.equal(body.error, "Payment not found");
});

test("payments RBAC: unauthenticated user cannot read a payment", async () => {
  const owner = await signup(`payment-unauth-${ts}@example.com`, "organizer");
  const fixture = await createPaidOrder(owner, "unauthenticated");

  const res = await fetch(`${baseUrl}/api/payments/${fixture.paymentId}`);
  const body = await res.json();

  assert.equal(res.status, 401, JSON.stringify(body));
});
