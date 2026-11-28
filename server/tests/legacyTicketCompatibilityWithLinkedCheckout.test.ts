import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

// #931 acceptance criterion 4: legacy bookings stay readable and check-in
// compatible after linked-Exhibition checkout is cut over to the Universal
// Event lifecycle, and historical data is not double counted. A legacy
// TicketBooking is created BEFORE the cutover flags are enabled; every
// assertion then runs with both flags ON.

const RESERVATIONS_FLAG = "LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED";
const CHECKOUT_FLAG = "LINKED_EXHIBITION_EVENT_CHECKOUT_ENABLED";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const previous = { reservations: process.env[RESERVATIONS_FLAG], checkout: process.env[CHECKOUT_FLAG] };
let organizerToken = "";
let organizerId = "";

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  restoreFlags();
  if (organizerId) {
    const exhibitions = await prisma.exhibition.findMany({ where: { organizerId }, select: { id: true, eventId: true } });
    const exhibitionIds = exhibitions.map((e) => e.id);
    const bookings = await prisma.ticketBooking.findMany({ where: { exhibitionId: { in: exhibitionIds } }, select: { id: true, paymentId: true, buyerUserId: true } });
    await prisma.checkIn.deleteMany({ where: { ticketBookingId: { in: bookings.map((b) => b.id) } } });
    await prisma.ticketBooking.deleteMany({ where: { id: { in: bookings.map((b) => b.id) } } });
    await prisma.payment.deleteMany({ where: { id: { in: bookings.map((b) => b.paymentId).filter((id): id is string => !!id) } } });
    const { cleanupOrganizers } = await import("./helpers/entitlementFixtures");
    await cleanupOrganizers([organizerId]);
    await prisma.user.deleteMany({ where: { id: { in: bookings.map((b) => b.buyerUserId).filter((id): id is string => !!id) } } });
  }
  await stop();
  await prisma.$disconnect();
});

function restoreFlags() {
  if (previous.reservations === undefined) delete process.env[RESERVATIONS_FLAG]; else process.env[RESERVATIONS_FLAG] = previous.reservations;
  if (previous.checkout === undefined) delete process.env[CHECKOUT_FLAG]; else process.env[CHECKOUT_FLAG] = previous.checkout;
}

async function signup(label: string, userType: "exhibitor" | "visitor") {
  const email = `legacy-compat-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `legacy-compat-${label}-${ts}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Legacy Compat ${label}`, userType }),
  });
  const body = await response.json() as { token: string; user: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(body));
  return { email, token: body.token, userId: body.user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test("legacy ticket bookings remain readable, scannable and single-counted after linked checkout cutover", async () => {
  // Cutover flags are OFF while the legacy booking is made.
  delete process.env[RESERVATIONS_FLAG];
  delete process.env[CHECKOUT_FLAG];

  const organizer = await signup("organizer", "exhibitor");
  organizerToken = organizer.token;
  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(organizer.token) },
    body: JSON.stringify({
      name: `Legacy Compat Exhibition ${ts}`,
      category: "Automotive",
      description: "legacy compatibility fixture",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      status: "live",
      visibility: "public",
      ticketTypes: [{ name: "Legacy General", price: 0, quantity: 10, visible: true }],
      stalls: [],
    }),
  });
  const createdBody = await created.json() as { exhibition: { id: string; eventId: string; organizerId: string; ticketTypes: Array<{ id: string }> } };
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const { id: exhibitionId, eventId } = createdBody.exhibition;
  organizerId = createdBody.exhibition.organizerId;
  const legacyTicketTypeId = createdBody.exhibition.ticketTypes[0].id;

  const visitor = await signup("visitor", "visitor");
  const booked = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(visitor.token) },
    body: JSON.stringify({ exhibitionId, ticketTypeId: legacyTicketTypeId, attendeeName: "Legacy Attendee", attendeeEmail: visitor.email, quantity: 1 }),
  });
  const bookedBody = await booked.json() as { booking: { id: string; qrCode: string } };
  assert.equal(booked.status, 201, JSON.stringify(bookedBody));
  const bookingId = bookedBody.booking.id;
  const qrCode = bookedBody.booking.qrCode;
  assert.ok(qrCode, "legacy booking must carry its QR code");

  // Cutover ON. Prove the flags are really effective for this Exhibition so the
  // rest of the test is not vacuous.
  process.env[RESERVATIONS_FLAG] = "true";
  process.env[CHECKOUT_FLAG] = "true";
  const publicRes = await fetch(`${baseUrl}/api/public/exhibitions/${exhibitionId}`);
  const publicBody = await publicRes.json() as { exhibition: { linkedEventCheckoutEnabled: boolean } };
  assert.equal(publicRes.status, 200);
  assert.equal(publicBody.exhibition.linkedEventCheckoutEnabled, true, "linked Event checkout must be active for this Exhibition");

  // The visitor still owns and can read the legacy ticket and its QR.
  const detail = await fetch(`${baseUrl}/api/bookings/tickets/${bookingId}`, { headers: auth(visitor.token) });
  assert.equal(detail.status, 200, "visitor can still read a pre-cutover legacy ticket");
  const qr = await fetch(`${baseUrl}/api/bookings/tickets/${bookingId}/qr`, { headers: auth(visitor.token) });
  assert.equal(qr.status, 200, "visitor can still fetch the QR of a pre-cutover legacy ticket");
  const mine = await fetch(`${baseUrl}/api/bookings/tickets/mine`, { headers: auth(visitor.token) });
  assert.ok(JSON.stringify(await mine.json()).includes(bookingId), "legacy ticket still appears in My Tickets");

  // The organizer can still look the ticket up by QR.
  const lookup = await fetch(`${baseUrl}/api/bookings/tickets/lookup/${encodeURIComponent(qrCode)}`, { headers: auth(organizer.token) });
  assert.equal(lookup.status, 200, "organizer can still look up a legacy QR after cutover");

  // Check-in works exactly once; a replay is rejected and writes nothing.
  const first = await fetch(`${baseUrl}/api/bookings/tickets/${bookingId}/check-in`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(organizer.token) },
    body: JSON.stringify({}),
  });
  assert.equal(first.status, 200, await first.clone().text());
  const second = await fetch(`${baseUrl}/api/bookings/tickets/${bookingId}/check-in`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(organizer.token) },
    body: JSON.stringify({}),
  });
  assert.equal(second.status, 409, "a duplicate legacy scan must be rejected after cutover");
  assert.equal(await prisma.checkIn.count({ where: { ticketBookingId: bookingId } }), 1, "exactly one check-in row");
  const history = await fetch(`${baseUrl}/api/bookings/tickets/${bookingId}/checkins`, { headers: auth(organizer.token) });
  assert.equal(history.status, 200);

  // No dual-source records: the legacy booking did not spawn Event-lifecycle
  // rows, so Event-based reporting cannot count the same ticket twice.
  const eventTicketType = await prisma.eventTicketType.findUniqueOrThrow({ where: { legacyTicketTypeId } });
  assert.equal(await prisma.eventTicket.count({ where: { eventId } }), 0, "no EventTicket exists for a legacy booking");
  assert.equal(await prisma.eventTicketOrder.count({ where: { eventId } }), 0, "no EventTicketOrder exists for a legacy booking");
  assert.equal(await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: eventTicketType.id } }), 0, "no reservation hold exists for a legacy booking");
  assert.equal(await prisma.ticketBooking.count({ where: { exhibitionId } }), 1, "exactly one legacy booking");
});
