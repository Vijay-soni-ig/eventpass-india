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
  const email = `ticket-owner-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: testPassword, fullName: `Ticket Owner ${label}`, userType: "visitor" }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, `visitor signup should succeed: ${JSON.stringify(body)}`);
  assert.ok(body.token, "visitor signup must return an auth token");
  assert.ok(body.user?.id, "visitor signup must return the user");
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

test("visitors can only read their own ticket detail and QR data", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, `ticket-owner-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const ticketType = await prisma.ticketType.findFirstOrThrow({
    where: { exhibitionId: organizer.firstExhibitionId, visible: true, price: 0 },
    select: { id: true },
  });

  const owner = await createVisitor("owner");
  const other = await createVisitor("other");

  const bookingResponse = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({
      exhibitionId: organizer.firstExhibitionId,
      ticketTypeId: ticketType.id,
      attendeeName: "Ticket Isolation Owner",
      attendeeEmail: owner.email,
      quantity: 1,
    }),
  });
  const bookingBody = await bookingResponse.json() as { booking?: { id: string; buyerUserId?: string } };
  assert.equal(bookingResponse.status, 201, `free ticket booking should succeed: ${JSON.stringify(bookingBody)}`);
  assert.ok(bookingBody.booking?.id, "booking response must include the created ticket ID");

  const ticketId = bookingBody.booking.id;
  const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
  const otherHeaders = { Authorization: `Bearer ${other.token}` };

  const ownerRead = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}`, { headers: ownerHeaders });
  assert.equal(ownerRead.status, 200, "ticket owner must be able to read their ticket");

  const otherRead = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}`, { headers: otherHeaders });
  assert.equal(otherRead.status, 404, "another visitor must not read ticket details by ID");

  const ownerQr = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}/qr`, { headers: ownerHeaders });
  assert.equal(ownerQr.status, 200, "ticket owner must be able to access their QR");

  const otherQr = await fetch(`${baseUrl}/api/bookings/tickets/${ticketId}/qr`, { headers: otherHeaders });
  assert.equal(otherQr.status, 404, "another visitor must not obtain ticket QR data");

  const otherMine = await fetch(`${baseUrl}/api/bookings/tickets/mine`, { headers: otherHeaders });
  assert.equal(otherMine.status, 200);
  const otherMineBody = await otherMine.json() as { bookings: Array<{ id: string }> };
  assert.ok(otherMineBody.bookings.every((booking) => booking.id !== ticketId), "my tickets must exclude another visitor's booking");

  const storedBooking = await prisma.ticketBooking.findUniqueOrThrow({
    where: { id: ticketId },
    select: { buyerUserId: true },
  });
  assert.equal(storedBooking.buyerUserId, owner.userId, "booking ownership must remain bound to the authenticated purchaser");
});
