import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { buildQrPayload } from "../src/lib/eventTicketIssuance";

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

async function createEvent(owner: User, label: string) {
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: owner.id, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  organizerIds.push(membership.organizerId);
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: owner.id,
      title: `Scanner RBAC ${label}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date(),
      endDate: new Date(),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }, { moduleType: "CHECK_IN", enabled: true }] },
    },
  });
  eventIds.push(event.id);
  const type = await prisma.eventTicketType.create({
    data: { eventId: event.id, name: "Scanner Test", price: 0, currency: "INR", capacity: 50, maxPerOrder: 5, status: "ACTIVE" },
  });
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId: event.id, eventTicketTypeId: type.id, userId: owner.id,
      attendeeName: "Scanner Test", attendeeEmail: owner.id + "@example.com",
      quantity: 1, unitPrice: 0, currency: "INR", status: "ACTIVE",
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
  const ticket = await prisma.eventTicket.findFirstOrThrow({ where: { eventTicketOrderId: body.order.id } });
  ticketIds.push(ticket.id);
  return { eventId: event.id, organizerId: membership.organizerId, ticketId: ticket.id, qr: buildQrPayload(ticket.id, ticket.ticketCode), ownerToken: owner.token, orderId: body.order.id };
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

test("universal scanner: authorized organizer can check in a paid active ticket", async () => {
  const owner = await signup(`scanner-owner-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "authorized");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr, eventId: fixture.eventId }),
  });
  assert.equal(res.status, 200, JSON.stringify(await res.json()));
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).status, "USED");
});

test("universal scanner: duplicate check-in is rejected and logged", async () => {
  const owner = await signup(`scanner-duplicate-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "duplicate");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` };
  assert.equal((await fetch(`${baseUrl}/api/event-ticket-check-ins`, { method: "POST", headers, body: JSON.stringify({ qrPayload: fixture.qr }) })).status, 200);
  const second = await fetch(`${baseUrl}/api/event-ticket-check-ins`, { method: "POST", headers, body: JSON.stringify({ qrPayload: fixture.qr }) });
  assert.equal(second.status, 409);
  const logs = await prisma.auditLog.count({ where: { entityId: fixture.ticketId, action: "EVENT_TICKET_DUPLICATE_CHECKIN_REJECTED" } });
  assert.equal(logs, 1);
});

test("universal scanner: visitor without scanner permission is rejected", async () => {
  const owner = await signup(`scanner-role-owner-${ts}@example.com`, "organizer");
  const visitor = await signup(`scanner-role-visitor-${ts}@example.com`, "visitor");
  const fixture = await createEvent(owner, "role");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 403);
});

test("universal scanner: cross-organizer scanner cannot scan another organizer event", async () => {
  const ownerA = await signup(`scanner-org-a-${ts}@example.com`, "organizer");
  const ownerB = await signup(`scanner-org-b-${ts}@example.com`, "organizer");
  const fixture = await createEvent(ownerA, "cross-org");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerB.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 403);
});

test("universal scanner: event mismatch is rejected", async () => {
  const owner = await signup(`scanner-event-mismatch-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "mismatch");
  const other = await createEvent(owner, "mismatch-other");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr, eventId: other.eventId }),
  });
  assert.equal(res.status, 409);
});

test("universal scanner: unauthenticated scan is rejected", async () => {
  const owner = await signup(`scanner-unauth-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "unauth");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 401);
});

test("universal scanner: suspended organizer loses scanner access", async () => {
  const owner = await signup(`scanner-suspended-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "suspended");
  await prisma.organizer.update({ where: { id: fixture.organizerId }, data: { suspended: true, suspendedAt: new Date(), suspendedReason: "scanner RBAC test" } });
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 403);
});

test("universal scanner: unpaid order cannot be checked in", async () => {
  const owner = await signup(`scanner-unpaid-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "unpaid");
  await prisma.eventTicketOrder.update({ where: { id: fixture.orderId }, data: { status: "PAYMENT_PENDING" } });
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 409);
});

test("universal scanner: cancelled ticket cannot be checked in", async () => {
  const owner = await signup(`scanner-cancelled-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "cancelled");
  await prisma.eventTicket.update({ where: { id: fixture.ticketId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 409);
});

test("universal scanner: refunded ticket cannot be checked in and is logged", async () => {
  const owner = await signup(`scanner-refunded-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "refunded");
  await prisma.eventTicket.update({ where: { id: fixture.ticketId }, data: { status: "REFUNDED" } });
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: fixture.qr }),
  });
  assert.equal(res.status, 409);
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: fixture.ticketId } })).status, "REFUNDED");
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: fixture.ticketId } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { entityId: fixture.ticketId, action: "EVENT_TICKET_CHECKIN_REJECTED" } }), 1);
});

test("universal scanner: concurrent scans of one ticket produce exactly one check-in", async () => {
  const owner = await signup(`scanner-concurrent-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "concurrent");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` };
  const scans = await Promise.all(
    Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/api/event-ticket-check-ins`, { method: "POST", headers, body: JSON.stringify({ qrPayload: fixture.qr }) }),
    ),
  );
  const statuses = scans.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 200).length, 1, `statuses: ${statuses.join(",")}`);
  assert.equal(statuses.filter((s) => s === 409).length, 9, `statuses: ${statuses.join(",")}`);
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: fixture.ticketId } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entityId: fixture.ticketId, action: "EVENT_TICKET_DUPLICATE_CHECKIN_REJECTED" } }), 9);
});

test("universal scanner: malformed QR is rejected without server error", async () => {
  const owner = await signup(`scanner-invalid-${ts}@example.com`, "organizer");
  const fixture = await createEvent(owner, "invalid");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ qrPayload: "ETX1.invalid.invalid-token" }),
  });
  assert.equal(res.status, 404);
});

test("universal scanner: summary is tenant-scoped", async () => {
  const ownerA = await signup(`scanner-summary-a-${ts}@example.com`, "organizer");
  const ownerB = await signup(`scanner-summary-b-${ts}@example.com`, "organizer");
  const fixture = await createEvent(ownerA, "summary");
  const res = await fetch(`${baseUrl}/api/event-ticket-check-ins/summary?eventId=${fixture.eventId}`, { headers: { Authorization: `Bearer ${ownerB.token}` } });
  assert.equal(res.status, 403);
});


test("cross-persona flow: visitor's free ticket is issued to the visitor and checked in by the event organizer", async () => {
  const organizer = await signup(`cross-persona-organizer-${ts}@example.com`, "organizer");
  const visitor = await signup(`cross-persona-visitor-${ts}@example.com`, "visitor");
  const fixture = await createEvent(organizer, "cross-persona");

  const ticketType = await prisma.eventTicketType.findFirstOrThrow({
    where: { eventId: fixture.eventId, status: "ACTIVE" },
    select: { id: true, price: true, currency: true },
  });
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId: fixture.eventId,
      eventTicketTypeId: ticketType.id,
      userId: visitor.id,
      attendeeName: "Cross Persona Visitor",
      attendeeEmail: `cross-persona-visitor-${ts}@example.com`,
      quantity: 1,
      unitPrice: ticketType.price,
      currency: ticketType.currency,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  reservationIds.push(reservation.id);

  const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const orderBody = await orderResponse.json();
  assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
  assert.equal(orderBody.order.status, "PAID");
  orderIds.push(orderBody.order.id);
  paymentIds.push(orderBody.payment.id);

  const issued = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: orderBody.order.id },
    select: { id: true, userId: true, ticketCode: true, status: true },
  });
  ticketIds.push(issued.id);
  assert.equal(issued.userId, visitor.id, "issued ticket must belong to the purchasing visitor");
  assert.equal(issued.status, "ACTIVE");

  const visitorTicket = await fetch(`${baseUrl}/api/event-tickets/${issued.id}`, {
    headers: { Authorization: `Bearer ${visitor.token}` },
  });
  assert.equal(visitorTicket.status, 200, "visitor can open their issued ticket");

  const scannerHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${organizer.token}` };
  const scan = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST",
    headers: scannerHeaders,
    body: JSON.stringify({ qrPayload: buildQrPayload(issued.id, issued.ticketCode), eventId: fixture.eventId }),
  });
  assert.equal(scan.status, 200, JSON.stringify(await scan.json()));

  const checkedIn = await prisma.eventTicket.findUniqueOrThrow({
    where: { id: issued.id },
    select: { status: true, checkedInAt: true, userId: true },
  });
  assert.equal(checkedIn.status, "USED");
  assert.ok(checkedIn.checkedInAt, "successful scan records check-in time");
  assert.equal(checkedIn.userId, visitor.id, "check-in must not change ticket ownership");

  const duplicate = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST",
    headers: scannerHeaders,
    body: JSON.stringify({ qrPayload: buildQrPayload(issued.id, issued.ticketCode), eventId: fixture.eventId }),
  });
  assert.equal(duplicate.status, 409, "a second scan must be rejected");
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: issued.id } }), 1);
});
