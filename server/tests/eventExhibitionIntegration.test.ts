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

async function holdExhibitionRow(exhibitionId: string) {
  let releaseLock!: () => void;
  let signalLockAcquired!: () => void;
  let blockerPid: number | undefined;
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const hold = new Promise<void>((resolve) => { releaseLock = resolve; });

  const transaction = prisma.$transaction(async (tx) => {
    const backend = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    blockerPid = backend[0]?.pid;
    if (blockerPid === undefined) throw new Error("Could not identify Exhibition-row blocker backend");
    await tx.$queryRaw`SELECT "id" FROM "exhibitions" WHERE "id" = ${exhibitionId} FOR UPDATE`;
    signalLockAcquired();
    await hold;
  });
  void transaction.catch(() => signalLockAcquired());
  await lockAcquired;
  if (blockerPid === undefined) {
    await transaction;
    throw new Error("Could not acquire Exhibition-row blocker");
  }
  return { blockerPid, release: releaseLock, transaction };
}

async function waitForBlockedQuery(blockingPid: number, queryPattern: string, timeoutMs = 10_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blocked = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT pid
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND state = 'active'
        AND ${blockingPid} = ANY(pg_blocking_pids(pid))
        AND query ILIKE ${queryPattern}
      ORDER BY query_start ASC
      LIMIT 1
    `;
    if (blocked[0]) return blocked[0].pid;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for query ${queryPattern} to block on PostgreSQL PID ${blockingPid}`);
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



async function holdEventInventoryLock(eventId: string) {
  let release!: () => void;
  let signalLocked!: () => void;
  const lockAcquired = new Promise<void>((resolve) => { signalLocked = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const transaction = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE`;
    signalLocked();
    await hold;
  });
  await lockAcquired;
  return { release, transaction };
}

async function waitForBlockedInventoryWriters(expectedCount: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND cardinality(pg_blocking_pids(pid)) > 0
        AND (
          query LIKE ${"%legacy-ticket-booking%"}
          OR query LIKE ${"%event-ticket-reservation%"}
        )
    `;
    if (Number(rows[0]?.count ?? 0n) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Both ticket writers must block on the shared Event row before either can consume the final ticket");
}

test("linked Exhibition Event reservations stay disabled by default and serialize against legacy booking for the final ticket", async () => {
  const { token: organizerToken } = await signupExhibitor("cross-path-final-ticket");
  const { status, body } = await createExhibition(organizerToken, {
    name: "Cross Path Final Ticket " + ts,
    status: "live",
    ticketTypes: [{ name: "Final Ticket", price: 0, quantity: 1, taxPercent: 0, visible: true }],
  });
  assert.equal(status, 201, JSON.stringify(body));

  const exhibitionId = body.exhibition.id as string;
  const eventId = body.exhibition.eventId as string;
  const ticketTypeId = body.exhibition.ticketTypes[0].id as string;
  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId: ticketTypeId },
  });
  assert.equal(eventTicketType.eventId, eventId);
  assert.equal(eventTicketType.capacity, 1);

  const visitorEmail = "cross-path-final-ticket-visitor-" + ts + "@example.com";
  const visitorResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: visitorEmail,
      password: "TestPassword123!",
      fullName: "Cross Path Final Ticket Visitor",
      userType: "visitor",
    }),
  });
  const visitorBody = await visitorResponse.json();
  assert.equal(visitorResponse.status, 201, JSON.stringify(visitorBody));
  const visitorToken = visitorBody.token as string;

  const flagName = "LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED";
  const previousFlag = process.env[flagName];
  try {
    delete process.env[flagName];
    const disabledReservation = await fetch(baseUrl + "/api/event-ticket-reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
      body: JSON.stringify({
        eventTicketTypeId: eventTicketType.id,
        attendeeName: "Feature Flag Visitor",
        attendeeEmail: visitorEmail,
        quantity: 1,
      }),
    });
    const disabledBody = await disabledReservation.json();
    assert.equal(disabledReservation.status, 404, JSON.stringify(disabledBody));
    assert.equal(
      await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: eventTicketType.id } }),
      0,
      "linked Exhibition reservations must remain disabled unless the explicit opt-in flag is true",
    );

    process.env[flagName] = "true";
    const held = await holdEventInventoryLock(eventId);
    const reservationPromise = fetch(baseUrl + "/api/event-ticket-reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + visitorToken,
        "Idempotency-Key": "cross-path-reservation-" + ts,
      },
      body: JSON.stringify({
        eventTicketTypeId: eventTicketType.id,
        attendeeName: "Cross Path Reservation Winner",
        attendeeEmail: visitorEmail,
        quantity: 1,
      }),
    });
    const bookingPromise = fetch(baseUrl + "/api/bookings/tickets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + visitorToken,
        "Idempotency-Key": "cross-path-booking-" + ts,
      },
      body: JSON.stringify({
        exhibitionId,
        ticketTypeId,
        attendeeName: "Cross Path Booking Winner",
        attendeeEmail: visitorEmail,
        quantity: 1,
      }),
    });

    try {
      await waitForBlockedInventoryWriters(2);
    } finally {
      held.release();
      await held.transaction;
    }

    const [reservationResponse, bookingResponse] = await Promise.all([reservationPromise, bookingPromise]);
    const reservationBody = await reservationResponse.json();
    const bookingBody = await bookingResponse.json();
    assert.ok([201, 409].includes(reservationResponse.status), JSON.stringify(reservationBody));
    assert.ok([201, 409].includes(bookingResponse.status), JSON.stringify(bookingBody));
    assert.equal(
      [reservationResponse.status, bookingResponse.status].filter((status) => status === 201).length,
      1,
      "exactly one of the Event reservation and legacy booking may consume the final ticket",
    );

    const [activeReservations, legacyBookings] = await Promise.all([
      prisma.eventTicketReservation.count({
        where: { eventTicketTypeId: eventTicketType.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
      }),
      prisma.ticketBooking.count({ where: { ticketTypeId } }),
    ]);
    assert.equal(activeReservations + legacyBookings, 1, "persisted consuming rows must never exceed the one-ticket capacity");
    assert.equal(reservationResponse.status === 201, activeReservations === 1);
    assert.equal(bookingResponse.status === 201, legacyBookings === 1);

    const detailResponse = await fetch(baseUrl + "/api/public/exhibitions/" + exhibitionId);
    const detailBody = await detailResponse.json();
    assert.equal(detailResponse.status, 200, JSON.stringify(detailBody));
    assert.equal(detailBody.exhibition.ticketTypes[0].remaining, 0,
      "legacy Exhibition detail must report sold out after either writer wins");
  } finally {
    if (previousFlag === undefined) delete process.env[flagName];
    else process.env[flagName] = previousFlag;
  }
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

  // The legacy Exhibition detail endpoint is still a public ticket surface.
  // It must expose the same combined legacy/Event inventory as the canonical Event endpoint.
  const exhibitionDetailResponse = await fetch(baseUrl + "/api/public/exhibitions/" + exhibitionId);
  const exhibitionDetailBody = await exhibitionDetailResponse.json();
  assert.equal(exhibitionDetailResponse.status, 200, JSON.stringify(exhibitionDetailBody));
  assert.equal(exhibitionDetailBody.exhibition.ticketTypes.length, 1);
  assert.equal(exhibitionDetailBody.exhibition.ticketTypes[0].id, ticketTypeId);
  assert.equal(exhibitionDetailBody.exhibition.ticketTypes[0].remaining, 9,
    "linked Exhibition detail must report the same remaining inventory as the Event ticket catalog");

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

test("linked Exhibition checkout stays disabled by default and opt-in uses the Universal Event order/payment/ticket lifecycle", async () => {
  const { token: organizerToken } = await signupExhibitor("linked-event-checkout");
  const { status, body } = await createExhibition(organizerToken, {
    name: "Linked Event Checkout " + ts,
    status: "live",
    ticketTypes: [{ name: "Universal Checkout", price: 500, quantity: 1, taxPercent: 0, visible: true }],
  });
  assert.equal(status, 201, JSON.stringify(body));

  const exhibitionId = body.exhibition.id as string;
  const eventId = body.exhibition.eventId as string;
  const legacyTicketTypeId = body.exhibition.ticketTypes[0].id as string;
  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId },
  });
  assert.equal(eventTicketType.eventId, eventId);
  assert.equal(eventTicketType.capacity, 1);

  const visitorEmail = "linked-event-checkout-visitor-" + ts + "@example.com";
  const visitorResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: visitorEmail,
      password: "TestPassword123!",
      fullName: "Linked Event Checkout Visitor",
      userType: "visitor",
    }),
  });
  const visitorBody = await visitorResponse.json();
  assert.equal(visitorResponse.status, 201, JSON.stringify(visitorBody));
  const visitorToken = visitorBody.token as string;

  const publicTicketResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/tickets");
  const publicTicketBody = await publicTicketResponse.json();
  assert.equal(publicTicketResponse.status, 200, JSON.stringify(publicTicketBody));
  assert.equal(publicTicketBody.ticketTypes.length, 1);
  assert.equal(publicTicketBody.ticketTypes[0].id, eventTicketType.id,
    "linked Exhibition public catalog must expose canonical EventTicketType IDs");
  assert.equal(publicTicketBody.ticketTypes[0].legacyTicketTypeId, legacyTicketTypeId,
    "the explicit legacy mapping remains available for registration-first compatibility");

  const reservationFlag = "LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED";
  const checkoutFlag = "LINKED_EXHIBITION_EVENT_CHECKOUT_ENABLED";
  const previousReservationFlag = process.env[reservationFlag];
  const previousCheckoutFlag = process.env[checkoutFlag];
  try {
    process.env[reservationFlag] = "true";
    delete process.env[checkoutFlag];

    const visitDate = "2026-12-02";
    const reservationKey = "linked-event-reservation-" + ts;
    const reservationRequest = {
      eventTicketTypeId: eventTicketType.id,
      attendeeName: "Linked Checkout Attendee",
      attendeeEmail: visitorEmail,
      quantity: 1,
      visitDate,
    };
    const reservationResponse = await fetch(baseUrl + "/api/event-ticket-reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken, "Idempotency-Key": reservationKey },
      body: JSON.stringify(reservationRequest),
    });
    const reservationBody = await reservationResponse.json();
    assert.equal(reservationResponse.status, 201, JSON.stringify(reservationBody));
    const reservationId = reservationBody.reservation.id as string;
    assert.equal(new Date(reservationBody.reservation.visitDate).toISOString().slice(0, 10), visitDate);

    const reservationReplay = await fetch(baseUrl + "/api/event-ticket-reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken, "Idempotency-Key": reservationKey },
      body: JSON.stringify(reservationRequest),
    });
    const reservationReplayBody = await reservationReplay.json();
    assert.equal(reservationReplay.status, 200, JSON.stringify(reservationReplayBody));
    assert.equal(reservationReplayBody.reservation.id, reservationId);

    const mismatchedDateReplay = await fetch(baseUrl + "/api/event-ticket-reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken, "Idempotency-Key": reservationKey },
      body: JSON.stringify({ ...reservationRequest, visitDate: "2026-12-03" }),
    });
    assert.equal(mismatchedDateReplay.status, 409, await mismatchedDateReplay.text());

    const ordersBeforeDisabledCheckout = await prisma.eventTicketOrder.count({ where: { reservationId } });
    const disabledCheckout = await fetch(baseUrl + "/api/event-ticket-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
      body: JSON.stringify({ reservationId }),
    });
    const disabledBody = await disabledCheckout.json();
    assert.equal(disabledCheckout.status, 409, JSON.stringify(disabledBody));
    assert.equal(disabledBody.error, "Event is no longer available");
    assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId } }), ordersBeforeDisabledCheckout,
      "disabled linked checkout must not create an order or its transactionally paired payment");

    process.env[checkoutFlag] = "true";

    // Hold the Exhibition row so the pause request reaches its transactional
    // update and remains in flight. With the required Event-first lock order,
    // checkout must then wait on the Event row held by the pause transaction.
    const exhibitionBlocker = await holdExhibitionRow(exhibitionId);
    const pauseRequest = fetch(baseUrl + "/api/exhibitions/" + exhibitionId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizerToken },
      body: JSON.stringify({ status: "paused" }),
    });
    let checkoutRequest: Promise<Response> | undefined;
    let checkoutBlockedByPause = false;
    let lockObservationError: unknown;
    try {
      const pausePid = await waitForBlockedQuery(exhibitionBlocker.blockerPid, "%UPDATE%exhibitions%");
      checkoutRequest = fetch(baseUrl + "/api/event-ticket-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
        body: JSON.stringify({ reservationId }),
      });
      await waitForBlockedQuery(pausePid, "%event-ticket-order%");
      checkoutBlockedByPause = true;
    } catch (error) {
      lockObservationError = error;
    } finally {
      exhibitionBlocker.release();
      await exhibitionBlocker.transaction;
    }

    const pauseResponse = await pauseRequest;
    const checkoutResponse = checkoutRequest ? await checkoutRequest : null;
    if (lockObservationError) throw lockObservationError;
    assert.ok(checkoutResponse, "the competing checkout request must be started");
    assert.equal(checkoutBlockedByPause, true, "checkout must wait behind the Event lock held by the Exhibition lifecycle update");
    assert.equal(pauseResponse.status, 200, await pauseResponse.clone().text());
    assert.equal(checkoutResponse.status, 409, await checkoutResponse.clone().text());
    assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId } }), 0,
      "a checkout queued behind a committed pause must not create an order");
    assert.equal(await prisma.eventTicket.count({ where: { eventTicketOrder: { reservationId } } }), 0,
      "a checkout queued behind a committed pause must not issue tickets");
    assert.equal((await prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservationId } })).status, "ACTIVE");

    const pausedCheckout = await fetch(baseUrl + "/api/event-ticket-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(pausedCheckout.status, 409, await pausedCheckout.clone().text());
    assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId } }), 0,
      "a paused linked Exhibition must not open a new payment order");

    const resumeResponse = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizerToken },
      body: JSON.stringify({ status: "live" }),
    });
    assert.equal(resumeResponse.status, 200, await resumeResponse.clone().text());

    const idempotencyKey = "linked-event-checkout-" + ts;
    const createOrder = () => fetch(baseUrl + "/api/event-ticket-orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + visitorToken,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ reservationId }),
    });
    const orderResponse = await createOrder();
    const orderBody = await orderResponse.json();
    assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
    assert.equal(orderBody.order.status, "PAYMENT_PENDING");
    assert.equal(orderBody.payment.status, "created");
    assert.ok(orderBody.checkout?.providerOrderId);
    assert.equal(orderBody.order.eventId, eventId);
    assert.equal(orderBody.order.reservationId, reservationId);
    assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId } }), 1);
    assert.equal(await prisma.eventTicket.count({ where: { eventTicketOrder: { reservationId } } }), 0,
      "tickets must not be issued before a verified payment outcome");

    const replayResponse = await createOrder();
    const replayBody = await replayResponse.json();
    assert.equal(replayResponse.status, 200, JSON.stringify(replayBody));
    assert.equal(replayBody.replayed, true);
    assert.equal(replayBody.order.id, orderBody.order.id);
    assert.equal(await prisma.eventTicketOrder.count({ where: { reservationId } }), 1,
      "an idempotent checkout retry must not create a second order");

    const completionResponse = await fetch(baseUrl + "/api/payments/" + orderBody.payment.id + "/mock-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + visitorToken },
      body: JSON.stringify({ outcome: "success" }),
    });
    const completionBody = await completionResponse.json();
    assert.equal(completionResponse.status, 200, JSON.stringify(completionBody));

    const [paidOrder, paidReservation, paidPayment, issuedTickets] = await Promise.all([
      prisma.eventTicketOrder.findFirstOrThrow({ where: { reservationId } }),
      prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservationId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: orderBody.payment.id } }),
      prisma.eventTicket.findMany({ where: { eventTicketOrder: { reservationId } } }),
    ]);
    assert.equal(paidOrder.status, "PAID");
    assert.equal(paidReservation.status, "CONVERTED");
    assert.equal(paidPayment.status, "paid");
    assert.equal(issuedTickets.length, 1);
    assert.equal(issuedTickets[0].eventId, eventId);
    assert.equal(issuedTickets[0].eventTicketTypeId, eventTicketType.id);
    assert.equal(issuedTickets[0].visitDate?.toISOString().slice(0, 10), visitDate,
      "the selected Exhibition visit date must survive reservation, payment and EventTicket issuance");
    assert.equal(issuedTickets[0].status, "ACTIVE");
    assert.equal(await prisma.ticketBooking.count({ where: { ticketTypeId: legacyTicketTypeId } }), 0,
      "Universal Event checkout must not create a parallel legacy TicketBooking");

    const exhibitionDetailResponse = await fetch(baseUrl + "/api/public/exhibitions/" + exhibitionId);
    const exhibitionDetailBody = await exhibitionDetailResponse.json();
    assert.equal(exhibitionDetailResponse.status, 200, JSON.stringify(exhibitionDetailBody));
    assert.equal(exhibitionDetailBody.exhibition.ticketTypes[0].remaining, 0,
      "legacy Exhibition inventory must count the paid Event order exactly once");
  } finally {
    if (previousReservationFlag === undefined) delete process.env[reservationFlag];
    else process.env[reservationFlag] = previousReservationFlag;
    if (previousCheckoutFlag === undefined) delete process.env[checkoutFlag];
    else process.env[checkoutFlag] = previousCheckoutFlag;
  }
});
