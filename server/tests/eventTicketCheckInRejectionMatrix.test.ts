import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { cleanupOrganizers } from "./helpers/entitlementFixtures";
import { buildQrPayload } from "../src/lib/eventTicketIssuance";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
let organizerToken = "";
let organizerUserId = "";
let organizerId = "";
let eventId = "";
let ticketTypeId = "";
const createdUserIds: string[] = [];
const createdExhibitionIds: string[] = [];
const createdEventIds: string[] = [];
const createdOrganizerIds: string[] = [];
const createdReservationIds: string[] = [];
const createdOrderIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdTicketIds: string[] = [];

const auth = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

async function issueFreeTicket(label: string): Promise<{ id: string; ticketCode: string; qrPayload: string; orderId: string }> {
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketTypeId,
      userId: organizerUserId,
      attendeeName: `Check-in ${label}`,
      attendeeEmail: `checkin-${label}-${ts}@example.com`,
      quantity: 1,
      unitPrice: 0,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  createdReservationIds.push(reservation.id);

  const response = await fetch(`${baseUrl}/api/event-ticket-orders`, {
    method: "POST",
    headers: auth(organizerToken),
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const body = await response.json() as { order?: { id: string; status: string }; payment?: { id: string }; error?: string };
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(body.order?.status, "PAID", JSON.stringify(body));
  assert.ok(body.order?.id);
  assert.ok(body.payment?.id);
  createdOrderIds.push(body.order.id);
  createdPaymentIds.push(body.payment.id);

  const ticket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventTicketOrderId: body.order.id },
    select: { id: true, ticketCode: true, status: true },
  });
  createdTicketIds.push(ticket.id);
  assert.equal(ticket.status, "ACTIVE");
  return {
    ...ticket,
    orderId: body.order.id,
    qrPayload: buildQrPayload(ticket.id, ticket.ticketCode),
  };
}

async function scan(qrPayload: string, scanEventId = eventId, token = organizerToken) {
  const response = await fetch(`${baseUrl}/api/event-ticket-check-ins`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ qrPayload, eventId: scanEventId }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());

  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-checkin-matrix-${ts}` },
    body: JSON.stringify({
      email: `event-checkin-owner-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Event Check-in Test Owner",
      userType: "exhibitor",
    }),
  });
  assert.equal(signupResponse.status, 201, await signupResponse.clone().text());
  const signup = await signupResponse.json() as { token: string; user: { id: string } };
  organizerToken = signup.token;
  organizerUserId = signup.user.id;
  createdUserIds.push(organizerUserId);

  // Use the supported onboarding path to establish organizer ownership.
  const exhibitionResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: auth(organizerToken),
    body: JSON.stringify({
      name: `Check-in matrix bootstrap ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201, await exhibitionResponse.clone().text());
  const exhibitionBody = await exhibitionResponse.json() as { exhibition: { id: string; organizerId: string } };
  createdExhibitionIds.push(exhibitionBody.exhibition.id);
  organizerId = exhibitionBody.exhibition.organizerId;
  createdOrganizerIds.push(organizerId);

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: auth(organizerToken),
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Check-in rejection matrix ${ts}`,
      status: "DRAFT",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Test venue",
    }),
  });
  assert.equal(eventResponse.status, 201, await eventResponse.clone().text());
  const eventBody = await eventResponse.json() as { event: { id: string } };
  eventId = eventBody.event.id;
  createdEventIds.push(eventId);

  await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED" } });
  for (const moduleType of ["TICKETING", "CHECK_IN"] as const) {
    await prisma.eventModuleEnablement.upsert({
      where: { eventId_moduleType: { eventId, moduleType } },
      create: { eventId, moduleType, enabled: true },
      update: { enabled: true },
    });
  }

  const ticketType = await prisma.eventTicketType.create({
    data: { eventId, name: "Free Admission", capacity: 100, maxPerOrder: 5, price: 0, status: "ACTIVE" },
  });
  ticketTypeId = ticketType.id;
});

after(async () => {
  try {
    if (createdTicketIds.length) {
      await prisma.eventTicketCheckIn.deleteMany({ where: { eventTicketId: { in: createdTicketIds } } });
      await prisma.eventTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (createdOrderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
    if (createdPaymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: createdPaymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
    }
    if (createdReservationIds.length) await prisma.eventTicketReservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    if (ticketTypeId) await prisma.eventTicketType.deleteMany({ where: { id: ticketTypeId } });
    if (createdEventIds.length) await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    if (createdExhibitionIds.length) await prisma.exhibition.deleteMany({ where: { id: { in: createdExhibitionIds } } });
    if (createdOrganizerIds.length) await cleanupOrganizers(createdOrganizerIds);
    if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  } finally {
    await stop();
  }
});

test("universal Event check-in accepts a valid paid ticket once and rejects a duplicate", async () => {
  const ticket = await issueFreeTicket("duplicate");
  const first = await scan(ticket.qrPayload);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await scan(ticket.qrPayload);
  assert.equal(second.status, 409, JSON.stringify(second.body));

  const [persisted, checkInCount] = await Promise.all([
    prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
    prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }),
  ]);
  assert.equal(persisted.status, "USED");
  assert.ok(persisted.checkedInAt);
  assert.equal(checkInCount, 1, "duplicate scans must not create a second check-in record");
});

test("universal Event check-in rejects a ticket presented for a different Event without consuming it", async () => {
  const ticket = await issueFreeTicket("wrong-event");
  const result = await scan(ticket.qrPayload, "different-event-id");
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 0);
});

test("universal Event check-in rejects scans when CHECK_IN is disabled server-side", async () => {
  const ticket = await issueFreeTicket("module-disabled");
  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "CHECK_IN" } },
    data: { enabled: false },
  });
  try {
    const result = await scan(ticket.qrPayload);
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
    assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 0);
  } finally {
    await prisma.eventModuleEnablement.update({
      where: { eventId_moduleType: { eventId, moduleType: "CHECK_IN" } },
      data: { enabled: true },
    });
  }
});

test("universal Event check-in rejects unpaid orders and does not consume the ticket", async () => {
  const ticket = await issueFreeTicket("unpaid");
  await prisma.eventTicketOrder.update({ where: { id: ticket.orderId }, data: { status: "PAYMENT_PENDING" } });
  const result = await scan(ticket.qrPayload);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 0);
});

test("universal Event check-in rejects cancelled and refunded tickets", async () => {
  for (const status of ["CANCELLED", "REFUNDED"] as const) {
    const ticket = await issueFreeTicket(status.toLowerCase());
    await prisma.eventTicket.update({
      where: { id: ticket.id },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? new Date() : null,
        refundedAt: status === "REFUNDED" ? new Date() : null,
      },
    });
    const result = await scan(ticket.qrPayload);
    assert.equal(result.status, 409, `${status}: ${JSON.stringify(result.body)}`);
    assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 0);
  }
});

test("universal Event check-in rejects unpublished and archived Events", async () => {
  const ticket = await issueFreeTicket("event-unavailable");
  await prisma.event.update({ where: { id: eventId }, data: { status: "DRAFT" } });
  try {
    const unpublished = await scan(ticket.qrPayload);
    assert.equal(unpublished.status, 409, JSON.stringify(unpublished.body));
    assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
  } finally {
    await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED" } });
  }

  await prisma.event.update({ where: { id: eventId }, data: { archivedAt: new Date() } });
  try {
    const archived = await scan(ticket.qrPayload);
    assert.equal(archived.status, 409, JSON.stringify(archived.body));
    assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
  } finally {
    await prisma.event.update({ where: { id: eventId }, data: { archivedAt: null } });
  }
});

test("concurrent scans of one universal Event ticket produce one check-in only", async () => {
  const ticket = await issueFreeTicket("concurrent");
  const results = await Promise.all([scan(ticket.qrPayload), scan(ticket.qrPayload)]);
  assert.deepEqual(results.map((r) => r.status).sort((a, b) => a - b), [200, 409], JSON.stringify(results));
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 1);
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "USED");
});

test("universal Event check-in rejects an authenticated user without scanner permission", async () => {
  const ticket = await issueFreeTicket("unauthorized");
  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-checkin-outsider-${ts}` },
    body: JSON.stringify({
      email: `event-checkin-outsider-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Unrelated Visitor",
      userType: "visitor",
    }),
  });
  assert.equal(signupResponse.status, 201, await signupResponse.clone().text());
  const signup = await signupResponse.json() as { token: string; user: { id: string } };
  createdUserIds.push(signup.user.id);

  const result = await scan(ticket.qrPayload, eventId, signup.token);
  assert.equal(result.status, 403, JSON.stringify(result.body));
  assert.equal((await prisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE");
  assert.equal(await prisma.eventTicketCheckIn.count({ where: { eventTicketId: ticket.id } }), 0);
});
