import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { linkNewEventToExhibition } from "../src/lib/eventMapping";
import { calculatePricing } from "../src/lib/pricingEngine";
import { pricingBreakdownToPaymentData } from "../src/lib/paymentService";

// ETX-EVENT-001C — verifies the "Exhibition created => Event exists =>
// Exhibition.eventId set => Event.exhibition points back" invariant holds
// continuously for newly created Exhibitions (not just via periodic
// backfill), and that PUT-time syncing never diverges. Exercises the real
// HTTP routes (not the underlying lib functions directly), since the whole
// point is verifying the routes wire the transaction correctly.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

async function signupExhibitor(label: string) {
  const email = `evtx-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtX ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  return { token: res.token as string, userId: res.user.id as string };
}

async function createExhibition(token: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `EvtX Exhibition ${ts}`,
      category: "Automotive",
      description: "integration fixture",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json() };
}

test("Create Exhibition -> Event automatically created, Exhibition.eventId populated, atomically", async () => {
  const { token } = await signupExhibitor("create");
  const { status, body } = await createExhibition(token);
  assert.equal(status, 201);
  const exhibition = body.exhibition;
  assert.ok(exhibition.eventId, "Exhibition.eventId must be populated immediately on creation");

  const event = await prisma.event.findUniqueOrThrow({ where: { id: exhibition.eventId }, include: { exhibition: true, moduleEnablements: true } });
  assert.equal(event.exhibition?.id, exhibition.id, "Event.exhibition must point back to the same Exhibition");
  assert.equal(event.eventType, "EXHIBITION");
  assert.equal(event.title, exhibition.name);
  assert.equal(event.organizerId, exhibition.organizerId);
  assert.equal(event.ownerId, exhibition.ownerId);

  const moduleTypes = event.moduleEnablements.map((m) => m.moduleType).sort();
  assert.deepEqual(moduleTypes, ["ANALYTICS", "CHECK_IN", "EXHIBITION", "EXHIBITORS", "FLOOR_PLAN", "LEADS", "STALL_BOOKING", "TICKETING"].sort(), "default Exhibition module bundle must be enabled automatically");
});

test("Existing Exhibition business logic still executes (publish-readiness gate still enforced) alongside Event linking", async () => {
  const { token } = await signupExhibitor("publish-gate");
  // status: live with no venue/city must still 400 — this proves the
  // Event-linking addition did not bypass or replace existing validation.
  const { status, body } = await createExhibition(token, { status: "live", venue: undefined, city: undefined });
  assert.equal(status, 400);
  assert.ok(body.missing?.includes("venue"));
});

test("Exhibition update syncs the linked Event's mirrored fields in the same transaction, and does not touch Exhibition-specific fields", async () => {
  const { token } = await signupExhibitor("update-sync");
  const { body: createBody } = await createExhibition(token);
  const exhibitionId = createBody.exhibition.id;
  const eventIdBefore = createBody.exhibition.eventId;

  const newStart = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  const newEnd = new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10);
  const putRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "EvtX Renamed", category: "Fintech", venue: "New Venue", city: "New City", startDate: newStart, endDate: newEnd, status: "live" }),
  });
  assert.equal(putRes.status, 200);
  const updated = await putRes.json();
  assert.equal(updated.exhibition.eventId, eventIdBefore, "PUT must never reassign the Exhibition to a different Event");

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventIdBefore }, include: { category: true } });
  assert.equal(event.title, "EvtX Renamed");
  assert.equal(event.venue, "New Venue");
  assert.equal(event.city, "New City");
  assert.equal(event.status, "PUBLISHED");
  assert.equal(event.category?.name, "Fintech");
  assert.equal(event.startDate?.toISOString().slice(0, 10), newStart);
  assert.equal(event.endDate?.toISOString().slice(0, 10), newEnd);

  // Exhibition-specific data (ticketTypes/stalls) is untouched by any of this.
  const exhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibitionId }, include: { ticketTypes: true, stalls: true } });
  assert.deepEqual(exhibition.ticketTypes, []);
  assert.deepEqual(exhibition.stalls, []);
});

test("Duplicating an Exhibition creates and links a new Event with the duplicated Exhibition", async () => {
  const { token } = await signupExhibitor("duplicate-event");
  const { body: createBody } = await createExhibition(token, {
    name: "Original Exhibition",
    category: "Automotive",
    description: "duplicate fixture",
    ticketTypes: [],
  });
  const originalId = createBody.exhibition.id;
  const originalEventId = createBody.exhibition.eventId;

  // Duplication is a second exhibition creation. The signup fixture starts
  // on Starter + trialing, where the first exhibition is a one-time lifetime
  // entitlement. Move the fixture to the normal active-subscription path so
  // the test exercises the duplicate/Event-link behavior rather than the
  // trial gate. The source is then completed so Starter's active-event limit
  // also permits the duplicate.
  await prisma.subscription.updateMany({
    where: { organizerId: createBody.exhibition.organizerId },
    data: { status: "active" },
  });
  await prisma.exhibition.update({ where: { id: originalId }, data: { status: "completed" } });

  const res = await fetch(baseUrl + "/api/exhibitions/" + originalId + "/duplicate", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(res.status, 201);

  const duplicate = (await res.json()).exhibition;
  assert.notEqual(duplicate.id, originalId);
  assert.notEqual(duplicate.eventId, originalEventId);
  assert.ok(duplicate.eventId, "duplicated Exhibition must have a paired Event");

  const [event, linkedExhibition] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: duplicate.eventId }, include: { exhibition: true } }),
    prisma.exhibition.findUniqueOrThrow({ where: { id: duplicate.id } }),
  ]);
  assert.equal(event.exhibition?.id, duplicate.id);
  assert.equal(event.eventType, "EXHIBITION");
  assert.equal(event.title, duplicate.name);
  assert.equal(event.organizerId, duplicate.organizerId);
  assert.equal(linkedExhibition.eventId, duplicate.eventId);
});
test("Repeated Exhibition updates never create a duplicate Event, and Exhibition.eventId never changes", async () => {
  const { token } = await signupExhibitor("no-dup");
  const { body: createBody } = await createExhibition(token);
  const exhibitionId = createBody.exhibition.id;
  const eventId = createBody.exhibition.eventId;
  const eventCountBefore = await prisma.event.count();

  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description: `update pass ${i}` }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.exhibition.eventId, eventId);
  }

  const eventCountAfter = await prisma.event.count();
  assert.equal(eventCountAfter, eventCountBefore, "repeated updates must never create additional Event rows");
});

test("Every ticket type/stall creation on an Exhibition remains completely unaffected by Event linking", async () => {
  const { token } = await signupExhibitor("ticket-stall");
  const { body } = await createExhibition(token, {
    ticketTypes: [{ name: "General", price: 100, quantity: 50, taxPercent: 0, visible: true }],
    stalls: [{ code: "A1", price: 500 }],
  });
  assert.equal(body.exhibition.ticketTypes.length, 1);
  assert.equal(body.exhibition.stalls.length, 1);
  assert.ok(body.exhibition.eventId);

  const event = await prisma.event.findUniqueOrThrow({ where: { id: body.exhibition.eventId } });
  assert.ok(event, "the paired Event must still exist alongside real ticket/stall data");
});


test("Linked Event rejects direct writes to Exhibition-owned mirrored fields without mutating either record", async () => {
  const { token } = await signupExhibitor("mirrored-write-boundary");
  const { status, body } = await createExhibition(token, {
    name: "Authoritative Exhibition " + ts,
    status: "draft",
    visibility: "private",
  });
  assert.equal(status, 201);

  const exhibitionId = body.exhibition.id as string;
  const eventId = body.exhibition.eventId as string;
  const originalEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(originalEvent.title, "Authoritative Exhibition " + ts);
  assert.equal(originalEvent.status, "DRAFT");
  assert.equal(originalEvent.visibility, "private");

  const attempted = await fetch(baseUrl + "/api/events/" + eventId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      title: "Unauthorized direct Event rename",
      status: "DRAFT",
      visibility: "public",
    }),
  });
  assert.equal(attempted.status, 400);
  const responseBody = await attempted.json();
  assert.deepEqual(responseBody.mirroredFields.sort(), ["status", "title", "visibility"]);
  assert.match(responseBody.error, /PUT \/api\/exhibitions\/.* instead/);

  const [persistedEvent, persistedExhibition] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.exhibition.findUniqueOrThrow({ where: { id: exhibitionId } }),
  ]);
  assert.equal(persistedEvent.title, originalEvent.title, "rejected PATCH must not mutate Event.title");
  assert.equal(persistedEvent.status, originalEvent.status, "rejected PATCH must not mutate Event.status");
  assert.equal(persistedEvent.visibility, originalEvent.visibility, "rejected PATCH must not mutate Event.visibility");
  assert.equal(persistedExhibition.name, "Authoritative Exhibition " + ts, "Exhibition remains the source of truth");
  assert.equal(persistedExhibition.status, "draft");
  assert.equal(persistedExhibition.visibility, "private");
});


test("a failed Exhibition/Event linking transaction rolls back the Exhibition, Event, and module rows together", async () => {
  const { token } = await signupExhibitor("transaction-rollback");
  const { status, body } = await createExhibition(token, {
    name: "Rollback baseline " + ts,
    status: "draft",
    visibility: "private",
  });
  assert.equal(status, 201);
  const baseline = await prisma.exhibition.findUniqueOrThrow({ where: { id: body.exhibition.id } });
  const rollbackName = "Rollback candidate " + ts;

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const candidate = await tx.exhibition.create({
        data: {
          ownerId: baseline.ownerId,
          organizerId: baseline.organizerId,
          name: rollbackName,
          category: "Rollback Sentinel " + ts,
          description: "This row must not survive the transaction",
          venue: "Rollback Venue",
          city: "Rollback City",
          status: "draft",
          visibility: "private",
        },
      });
      await linkNewEventToExhibition(tx, candidate);
      throw new Error("intentional rollback sentinel");
    }),
    /intentional rollback sentinel/,
  );

  const [leakedExhibition, leakedEvent, leakedModules] = await Promise.all([
    prisma.exhibition.findFirst({ where: { name: rollbackName } }),
    prisma.event.findFirst({ where: { title: rollbackName } }),
    prisma.eventModuleEnablement.findMany({ where: { event: { title: rollbackName } }, select: { id: true } }),
  ]);

  assert.equal(leakedExhibition, null, "failed transaction must roll back Exhibition creation");
  assert.equal(leakedEvent, null, "failed transaction must roll back Event creation");
  assert.equal(leakedModules.length, 0, "failed transaction must roll back module enablements");
});


test("linked Exhibition availability and legacy booking enforce the combined legacy/Event inventory union", async () => {
  const { token: organizerToken } = await signupExhibitor("unified-inventory");
  const { status, body } = await createExhibition(organizerToken, {
    name: "Unified Inventory " + ts,
    status: "live",
    ticketTypes: [{ name: "Mapped General", price: 0, quantity: 30, taxPercent: 0, visible: true }],
  });
  assert.equal(status, 201, JSON.stringify(body));

  const exhibitionId = body.exhibition.id as string;
  const eventId = body.exhibition.eventId as string;
  const ticketTypeId = body.exhibition.ticketTypes[0].id as string;
  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId: ticketTypeId },
  });
  assert.equal(eventTicketType.eventId, eventId);

  const visitorEmail = `unified-inventory-visitor-${ts}@example.com`;
  const visitorResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: visitorEmail,
      password: "TestPassword123!",
      fullName: "Unified Inventory Visitor",
      userType: "visitor",
    }),
  });
  const visitorBody = await visitorResponse.json();
  assert.equal(visitorResponse.status, 201, JSON.stringify(visitorBody));
  const visitorId = visitorBody.user.id as string;
  const visitorToken = visitorBody.token as string;

  // Preserve established legacy semantics: failed/refunded rows release
  // stock; created/cancelled/partially-refunded/paid rows still consume it.
  for (const booking of [
    { quantity: 2, paymentStatus: "paid" as const },
    { quantity: 1, paymentStatus: "created" as const },
    { quantity: 1, paymentStatus: "partially_refunded" as const },
    { quantity: 1, paymentStatus: "cancelled" as const },
    { quantity: 4, paymentStatus: "failed" as const },
    { quantity: 3, paymentStatus: "refunded" as const },
  ]) {
    await prisma.ticketBooking.create({
      data: {
        exhibitionId,
        ticketTypeId,
        buyerUserId: visitorId,
        quantity: booking.quantity,
        unitPrice: 0,
        amountPaid: 0,
        paymentStatus: booking.paymentStatus,
      },
    });
  }

  const pricing = await calculatePricing(0);
  const createEventReservation = async (params: {
    label: string;
    quantity: number;
    status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "CONVERTED";
    expiresAt: Date;
    orderStatus?: "PAYMENT_PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
  }) => {
    const reservation = await prisma.eventTicketReservation.create({
      data: {
        eventId,
        eventTicketTypeId: eventTicketType.id,
        userId: visitorId,
        attendeeName: "Unified Inventory " + params.label,
        attendeeEmail: visitorEmail,
        quantity: params.quantity,
        unitPrice: 0,
        currency: "INR",
        status: params.status,
        expiresAt: params.expiresAt,
      },
    });
    if (params.orderStatus) {
      const paymentStatus = {
        PAYMENT_PENDING: "created",
        PAID: "paid",
        FAILED: "failed",
        CANCELLED: "cancelled",
        REFUNDED: "refunded",
      } as const;
      const payment = await prisma.payment.create({
        data: {
          ...pricingBreakdownToPaymentData(pricing),
          currency: "INR",
          provider: "mock",
          status: paymentStatus[params.orderStatus],
        },
      });
      await prisma.eventTicketOrder.create({
        data: {
          eventId,
          reservationId: reservation.id,
          userId: visitorId,
          paymentId: payment.id,
          quantity: params.quantity,
          unitPrice: 0,
          subtotal: 0,
          totalAmount: 0,
          currency: "INR",
          status: params.orderStatus,
        },
      });
    }
    return reservation;
  };

  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  await createEventReservation({ label: "active-no-order", quantity: 2, status: "ACTIVE", expiresAt: future });
  await createEventReservation({ label: "active-pending-order", quantity: 1, status: "ACTIVE", expiresAt: future, orderStatus: "PAYMENT_PENDING" });
  await createEventReservation({ label: "expired-active", quantity: 5, status: "ACTIVE", expiresAt: past });
  await createEventReservation({ label: "cancelled", quantity: 6, status: "CANCELLED", expiresAt: future });
  await createEventReservation({ label: "paid-converted", quantity: 3, status: "CONVERTED", expiresAt: future, orderStatus: "PAID" });
  await createEventReservation({ label: "failed", quantity: 7, status: "CANCELLED", expiresAt: future, orderStatus: "FAILED" });
  await createEventReservation({ label: "cancelled-order", quantity: 8, status: "CANCELLED", expiresAt: future, orderStatus: "CANCELLED" });
  await createEventReservation({ label: "refunded", quantity: 9, status: "CONVERTED", expiresAt: future, orderStatus: "REFUNDED" });
  // Defensive union case: a stale ACTIVE reservation paired with a PAID
  // order is counted once via the order, not twice.
  await createEventReservation({ label: "paid-active-dedup", quantity: 10, status: "ACTIVE", expiresAt: future, orderStatus: "PAID" });

  const publicResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/tickets");
  const publicBody = await publicResponse.json();
  assert.equal(publicResponse.status, 200, JSON.stringify(publicBody));
  assert.equal(publicBody.ticketTypes.length, 1);
  // Legacy consuming quantity 5 + active/pending Event reservations 3
  // + PAID Event orders 13 = 21 consumed from a capacity of 30.
  assert.equal(publicBody.ticketTypes[0].remaining, 9);
  assert.equal(publicBody.ticketTypes[0].soldOut, false);

  const bookingsBefore = await prisma.ticketBooking.count({ where: { ticketTypeId } });
  const overCapacity = await fetch(baseUrl + "/api/bookings/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
    body: JSON.stringify({
      exhibitionId,
      ticketTypeId,
      attendeeName: "Over Capacity Visitor",
      attendeeEmail: visitorEmail,
      quantity: 10,
    }),
  });
  const overCapacityBody = await overCapacity.json();
  assert.equal(overCapacity.status, 409, JSON.stringify(overCapacityBody));
  assert.equal(overCapacityBody.remaining, 9);
  assert.equal(await prisma.ticketBooking.count({ where: { ticketTypeId } }), bookingsBefore,
    "legacy booking must not exceed the shared remaining inventory");
});
