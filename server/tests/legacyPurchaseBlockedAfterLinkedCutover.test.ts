import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { cleanupOrganizers } from "./helpers/entitlementFixtures";

// #931: once linked-Exhibition checkout is cut over, the legacy purchase API
// must refuse new purchases (409) instead of minting a parallel TicketBooking,
// while staying fully available with the flags off (the default), with only one
// flag on, for partially mapped catalogs, and for idempotent replays of
// bookings made before the cutover.

const RESERVATIONS_FLAG = "LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED";
const CHECKOUT_FLAG = "LINKED_EXHIBITION_EVENT_CHECKOUT_ENABLED";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const previous = { reservations: process.env[RESERVATIONS_FLAG], checkout: process.env[CHECKOUT_FLAG] };
const organizerIds: string[] = [];
const userIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  setFlags(previous.reservations, previous.checkout);
  const exhibitions = await prisma.exhibition.findMany({ where: { organizerId: { in: organizerIds } }, select: { id: true } });
  const bookings = await prisma.ticketBooking.findMany({ where: { exhibitionId: { in: exhibitions.map((e) => e.id) } }, select: { id: true, paymentId: true } });
  await prisma.checkIn.deleteMany({ where: { ticketBookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.ticketBooking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } });
  await prisma.payment.deleteMany({ where: { id: { in: bookings.map((b) => b.paymentId).filter((id): id is string => !!id) } } });
  await cleanupOrganizers(organizerIds);
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

function setFlags(reservations: string | undefined, checkout: string | undefined) {
  if (reservations === undefined) delete process.env[RESERVATIONS_FLAG]; else process.env[RESERVATIONS_FLAG] = reservations;
  if (checkout === undefined) delete process.env[CHECKOUT_FLAG]; else process.env[CHECKOUT_FLAG] = checkout;
}

async function signup(label: string, userType: "exhibitor" | "visitor") {
  const email = `legacy-block-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `legacy-block-${label}-${ts}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Legacy Block ${label}`, userType }),
  });
  const body = await response.json() as { token: string; user: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { email, token: body.token };
}

async function createLiveExhibition(token: string, label: string, ticketCount = 2) {
  const response = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Legacy Block ${label} ${ts}`,
      category: "Automotive",
      description: "legacy purchase guard fixture",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      status: "live",
      visibility: "public",
      ticketTypes: Array.from({ length: ticketCount }, (_, i) => ({ name: `General ${i + 1}`, price: 0, quantity: 20, visible: true })),
      stalls: [],
    }),
  });
  const body = await response.json() as { exhibition: { id: string; eventId: string; organizerId: string; ticketTypes: Array<{ id: string }> } };
  assert.equal(response.status, 201, JSON.stringify(body));
  organizerIds.push(body.exhibition.organizerId);
  return { exhibitionId: body.exhibition.id, eventId: body.exhibition.eventId, ticketTypeIds: body.exhibition.ticketTypes.map((t) => t.id) };
}

async function legacyPurchase(token: string, email: string, exhibitionId: string, ticketTypeId: string, idempotencyKey?: string) {
  return fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Legacy Block Attendee", attendeeEmail: email, quantity: 1 }),
  });
}

async function publicCheckoutFlag(exhibitionId: string) {
  const response = await fetch(`${baseUrl}/api/public/exhibitions/${exhibitionId}`);
  assert.equal(response.status, 200);
  return (await response.json() as { exhibition: { linkedEventCheckoutEnabled: boolean } }).exhibition.linkedEventCheckoutEnabled;
}

test("legacy purchase is blocked with 409 only when both cutover flags are on, and stays consistent with the public checkout flag", async () => {
  const organizer = await signup("organizer", "exhibitor");
  const visitor = await signup("visitor", "visitor");
  const { exhibitionId, ticketTypeIds } = await createLiveExhibition(organizer.token, "guard");
  const bookingCount = () => prisma.ticketBooking.count({ where: { exhibitionId } });

  // Flags off (default): legacy purchase works and the public flag is false.
  setFlags(undefined, undefined);
  assert.equal(await publicCheckoutFlag(exhibitionId), false);
  assert.equal((await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0])).status, 201);
  assert.equal(await bookingCount(), 1);

  // Only one flag on: still legacy.
  setFlags("true", undefined);
  assert.equal(await publicCheckoutFlag(exhibitionId), false);
  assert.equal((await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0])).status, 201);
  setFlags(undefined, "true");
  assert.equal(await publicCheckoutFlag(exhibitionId), false);
  assert.equal((await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0])).status, 201);
  assert.equal(await bookingCount(), 3);

  // Both on: the public page advertises Event checkout AND the legacy API refuses.
  setFlags("true", "true");
  assert.equal(await publicCheckoutFlag(exhibitionId), true);
  const blocked = await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[1]);
  assert.equal(blocked.status, 409);
  const blockedBody = await blocked.json() as { code: string; eventId: string };
  assert.equal(blockedBody.code, "LINKED_EVENT_CHECKOUT_REQUIRED");
  assert.equal(blockedBody.eventId, (await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibitionId }, select: { eventId: true } })).eventId);
  assert.equal(await bookingCount(), 3, "a blocked legacy purchase must not create a TicketBooking");

  // Rolling back (flags off) re-opens the legacy path.
  setFlags(undefined, undefined);
  assert.equal((await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[1])).status, 201);
  assert.equal(await bookingCount(), 4);
});

test("an idempotent replay of a pre-cutover legacy booking still returns the original booking", async () => {
  const organizer = await signup("replay-organizer", "exhibitor");
  const visitor = await signup("replay-visitor", "visitor");
  const { exhibitionId, ticketTypeIds } = await createLiveExhibition(organizer.token, "replay");

  setFlags(undefined, undefined);
  const key = `legacy-replay-${ts}`;
  const first = await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0], key);
  assert.equal(first.status, 201);
  const firstId = (await first.json() as { booking: { id: string } }).booking.id;

  setFlags("true", "true");
  const replay = await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0], key);
  assert.equal(replay.status, 200, "replaying a pre-cutover booking must not be turned into a 409");
  const replayBody = await replay.json() as { booking: { id: string }; replayed: boolean };
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.booking.id, firstId);
  assert.equal(await prisma.ticketBooking.count({ where: { exhibitionId } }), 1);
});

test("a partially mapped catalog keeps the legacy purchase path open", async () => {
  const organizer = await signup("partial-organizer", "exhibitor");
  const visitor = await signup("partial-visitor", "visitor");
  const { exhibitionId, ticketTypeIds } = await createLiveExhibition(organizer.token, "partial");

  // Unmap one visible ticket type from the Event catalog.
  await prisma.eventTicketType.update({ where: { legacyTicketTypeId: ticketTypeIds[1] }, data: { legacyTicketTypeId: null } });

  setFlags("true", "true");
  assert.equal(await publicCheckoutFlag(exhibitionId), false, "public page must not advertise Event checkout for a partially mapped catalog");
  const response = await legacyPurchase(visitor.token, visitor.email, exhibitionId, ticketTypeIds[0]);
  assert.equal(response.status, 201, "the server guard must agree with the public flag and stay open");
});
