import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { createTicketType, lookupTicketAsExhibitor, checkInAsExhibitor } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

/** Bootstraps an organizer + exhibition + one CONFIRMED exhibitor participation (the P0-3 authorization boundary), plus one paid visitor ticket for that exhibition. */
async function setUpConfirmedExhibitorWithPaidTicket(label: string) {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts);
  organizerIds.push(organizerId);
  const { token: exhibitorToken, participationId, userId: exhibitorUserId } = await applyAsExhibitor(baseUrl, firstExhibitionId, `${label}-ex`, ts);
  const approve = await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  // Confirmed directly — this test targets scanner authorization, not the
  // payment flow (already covered by phase21bPaymentRetry.test.ts).
  await prisma.exhibitionExhibitor.update({ where: { id: participationId }, data: { status: "confirmed" } });

  const ticketTypeId = await createTicketType(baseUrl, organizerToken, firstExhibitionId, 0);

  return { organizerId, organizerToken, firstExhibitionId, exhibitorToken, participationId, exhibitorUserId, ticketTypeId };
}

test("a pure exhibitor with a CONFIRMED participation can look up and check in a valid paid ticket for that exhibition", async () => {
  const { organizerToken, firstExhibitionId, exhibitorToken, ticketTypeId } = await setUpConfirmedExhibitorWithPaidTicket("scanner-happy");
  void organizerToken;

  const visitorSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `phase21b-visitor-happy-${ts}@example.com`, password: "testpass123", fullName: "Visitor", userType: "visitor" }),
  }).then((r) => r.json());
  visitorUserIds.push(visitorSignup.user.id);

  const bookRes = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorSignup.token}` },
    body: JSON.stringify({ exhibitionId: firstExhibitionId, ticketTypeId, attendeeName: "Visitor", attendeeEmail: visitorSignup.user.email, quantity: 1 }),
  }).then((r) => r.json());
  assert.equal(bookRes.booking.paymentStatus, "paid", "a ₹0 ticket type is paid immediately, no gateway needed");

  const lookup = await lookupTicketAsExhibitor(baseUrl, exhibitorToken, bookRes.booking.qrCode);
  assert.equal(lookup.status, 200, JSON.stringify(lookup.body));
  assert.equal(lookup.body.booking.id, bookRes.booking.id);

  const checkIn = await checkInAsExhibitor(baseUrl, exhibitorToken, bookRes.booking.id);
  assert.equal(checkIn.status, 200, JSON.stringify(checkIn.body));
  assert.equal(checkIn.body.booking.checkInStatus, true);

  // Duplicate check-in without force is rejected — same rule as the
  // organizer scanner, unchanged by this fix.
  const duplicate = await checkInAsExhibitor(baseUrl, exhibitorToken, bookRes.booking.id);
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
});

test("an exhibitor with no confirmed participation in an exhibition cannot look up or check in its tickets", async () => {
  const { firstExhibitionId, ticketTypeId } = await setUpConfirmedExhibitorWithPaidTicket("scanner-unrelated");

  // A second, unrelated exhibitor — never applied to, let alone confirmed
  // for, this exhibition.
  const { organizerId: otherOrgId, token: otherOrganizerToken } = await bootstrapOrganizer(baseUrl, "scanner-unrelated-other-org", ts);
  organizerIds.push(otherOrgId);
  void otherOrganizerToken;
  const outsiderSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `phase21b-outsider-${ts}@example.com`, password: "testpass123", fullName: "Outsider", userType: "exhibitor" }),
  }).then((r) => r.json());
  visitorUserIds.push(outsiderSignup.user.id);

  const visitorSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `phase21b-visitor-unrelated-${ts}@example.com`, password: "testpass123", fullName: "Visitor", userType: "visitor" }),
  }).then((r) => r.json());
  visitorUserIds.push(visitorSignup.user.id);

  const bookRes = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorSignup.token}` },
    body: JSON.stringify({ exhibitionId: firstExhibitionId, ticketTypeId, attendeeName: "Visitor", attendeeEmail: visitorSignup.user.email, quantity: 1 }),
  }).then((r) => r.json());

  const lookup = await lookupTicketAsExhibitor(baseUrl, outsiderSignup.token, bookRes.booking.qrCode);
  assert.equal(lookup.status, 404, JSON.stringify(lookup.body));

  const checkIn = await checkInAsExhibitor(baseUrl, outsiderSignup.token, bookRes.booking.id);
  assert.equal(checkIn.status, 404, JSON.stringify(checkIn.body));
});

test("an unpaid ticket cannot be checked in by an authorized exhibitor either", async () => {
  const { organizerToken, firstExhibitionId, exhibitorToken } = await setUpConfirmedExhibitorWithPaidTicket("scanner-unpaid");
  const paidTicketTypeId = await createTicketType(baseUrl, organizerToken, firstExhibitionId, 500);

  const visitorSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `phase21b-visitor-unpaid-${ts}@example.com`, password: "testpass123", fullName: "Visitor", userType: "visitor" }),
  }).then((r) => r.json());
  visitorUserIds.push(visitorSignup.user.id);

  const bookRes = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorSignup.token}` },
    body: JSON.stringify({ exhibitionId: firstExhibitionId, ticketTypeId: paidTicketTypeId, attendeeName: "Visitor", attendeeEmail: visitorSignup.user.email, quantity: 1 }),
  }).then((r) => r.json());
  assert.equal(bookRes.booking.paymentStatus, "created", "a priced ticket must not start paid");

  const checkIn = await checkInAsExhibitor(baseUrl, exhibitorToken, bookRes.booking.id);
  assert.equal(checkIn.status, 400, JSON.stringify(checkIn.body));
});
