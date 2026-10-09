import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const testPassword = "TestPassword123!";

async function createVisitor(label: string) {
  const email = `checkin-isolation-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: testPassword, fullName: `Check-in Isolation ${label}`, userType: "visitor" }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, `visitor signup should succeed: ${JSON.stringify(body)}`);
  assert.ok(body.token);
  assert.ok(body.user?.id);
  return { email, token: body.token, userId: body.user.id };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("organizers cannot look up, check in, or inspect check-ins for another organizer's ticket", async () => {
  const owner = await bootstrapOrganizer(baseUrl, `checkin-owner-${ts}`, ts);
  const attacker = await bootstrapOrganizer(baseUrl, `checkin-attacker-${ts}`, ts + 1);
  organizerIds.push(owner.organizerId, attacker.organizerId);

  const ticketType = await prisma.ticketType.findFirstOrThrow({
    where: { exhibitionId: owner.firstExhibitionId, visible: true, price: 0 },
    select: { id: true },
  });
  const visitor = await createVisitor("owner");

  const bookingResponse = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({
      exhibitionId: owner.firstExhibitionId,
      ticketTypeId: ticketType.id,
      attendeeName: "Check-in Isolation Visitor",
      attendeeEmail: visitor.email,
      quantity: 1,
    }),
  });
  const bookingBody = await bookingResponse.json() as { booking?: { id: string } };
  assert.equal(bookingResponse.status, 201, `free ticket booking should succeed: ${JSON.stringify(bookingBody)}`);
  assert.ok(bookingBody.booking?.id);
  const ticketId = bookingBody.booking.id;
  const storedBefore = await prisma.ticketBooking.findUniqueOrThrow({
    where: { id: ticketId },
    select: { qrCode: true, checkInStatus: true },
  });
  assert.equal(storedBefore.checkInStatus, false);

  const attackerHeaders = { Authorization: `Bearer ${attacker.token}`, "Content-Type": "application/json" };
  const lookup = await fetch(`${baseUrl}/api/bookings/tickets/lookup/${encodeURIComponent(storedBefore.qrCode)}`, {
    headers: attackerHeaders,
  });
  assert.equal(lookup.status, 404, "another organizer must not look up the ticket QR");

  const checkIn = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}/check-in`, {
    method: "PATCH",
    headers: attackerHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(checkIn.status, 404, "another organizer must not check in the ticket");

  const history = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}/checkins`, {
    headers: attackerHeaders,
  });
  assert.equal(history.status, 404, "another organizer must not read check-in history");

  const attackerList = await fetch(`${baseUrl}/api/bookings/tickets?exhibitionId=${owner.firstExhibitionId}`, {
    headers: attackerHeaders,
  });
  assert.equal(attackerList.status, 200);
  const attackerListBody = await attackerList.json() as { bookings: Array<{ id: string }> };
  assert.ok(attackerListBody.bookings.every((booking) => booking.id !== ticketId));

  const storedAfter = await prisma.ticketBooking.findUniqueOrThrow({
    where: { id: ticketId },
    select: { checkInStatus: true },
  });
  assert.equal(storedAfter.checkInStatus, false, "unauthorized scan must not mutate ticket check-in status");
  assert.equal(await prisma.checkIn.count({ where: { ticketBookingId: ticketId } }), 0, "unauthorized scan must not create a check-in record");
});
