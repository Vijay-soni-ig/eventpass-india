import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { bookTicket, createTicketType, lookupTicketAsExhibitor, checkInAsExhibitor } from "./helpers/phase21bFixtures";

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


async function createFreeVisitorTicket(label: string, exhibitionId: string, ticketTypeId: string) {
  const email = "phase21b-" + label + "-" + ts + "@example.com";
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: "Scanner Race Visitor", userType: "visitor" }),
  }).then((response) => response.json());
  visitorUserIds.push(signup.user.id);
  const booked = await bookTicket(baseUrl, signup.token, exhibitionId, ticketTypeId, email);
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  assert.equal(booked.body.booking.paymentStatus, "paid");
  return booked.body.booking;
}

async function holdExhibitorBusinessRevocation(businessId: string, membershipId: string) {
  let releaseLock!: () => void;
  let signalLockAcquired!: () => void;
  let blockerPid: number | undefined;
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const hold = new Promise<void>((resolve) => { releaseLock = resolve; });
  const transaction = prisma.$transaction(async (tx) => {
    const backend = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
    blockerPid = backend[0]?.pid;
    if (blockerPid === undefined) throw new Error("Could not identify exhibitor-business lock transaction backend");
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT \"id\" FROM \"exhibitor_businesses\" WHERE \"id\" = $1 FOR UPDATE",
      businessId,
    );
    signalLockAcquired();
    await hold;
    await tx.exhibitorMembership.update({
      where: { id: membershipId },
      data: { status: "revoked", revokedAt: new Date() },
    });
  });
  await lockAcquired;
  return { blockerPid: blockerPid!, release: releaseLock, transaction };
}

async function holdExhibitorParticipationWithdrawal(participationId: string) {
  let releaseLock!: () => void;
  let signalLockAcquired!: () => void;
  let blockerPid: number | undefined;
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const hold = new Promise<void>((resolve) => { releaseLock = resolve; });
  const transaction = prisma.$transaction(async (tx) => {
    const backend = await tx.$queryRawUnsafe<Array<{ pid: number }>>("SELECT pg_backend_pid() AS pid");
    blockerPid = backend[0]?.pid;
    if (blockerPid === undefined) throw new Error("Could not identify participation lock transaction backend");
    await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT \"id\" FROM \"exhibition_exhibitors\" WHERE \"id\" = $1 FOR UPDATE",
      participationId,
    );
    signalLockAcquired();
    await hold;
    await tx.exhibitionExhibitor.update({
      where: { id: participationId },
      data: { status: "cancelled" },
    });
  });
  await lockAcquired;
  return { blockerPid: blockerPid!, release: releaseLock, transaction };
}

async function waitForBlockedScannerAccess(blockerPid: number, table: "exhibitor_businesses" | "exhibition_exhibitors") {
  const deadline = Date.now() + 10_000;
  const query = "SELECT pid FROM pg_stat_activity " +
    "WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND state = 'active' " +
    "AND $1 = ANY(pg_blocking_pids(pid)) AND query ILIKE $2";
  const pattern = "%FROM \"" + table + "\"%";
  while (Date.now() < deadline) {
    const waiting = await prisma.$queryRawUnsafe<Array<{ pid: number }>>(query, blockerPid, pattern);
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for exhibitor scanner to block on " + table);
}

test("exhibitor scanner QR lookup waits for membership revocation before returning visitor data", async () => {
  const fixture = await setUpConfirmedExhibitorWithPaidTicket("scanner-membership-revoke-lookup");
  const booking = await createFreeVisitorTicket("membership-revoke-lookup", fixture.firstExhibitionId, fixture.ticketTypeId);
  const membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: fixture.exhibitorUserId, status: "active" },
    select: { id: true, exhibitorBusinessId: true },
  });
  const held = await holdExhibitorBusinessRevocation(membership.exhibitorBusinessId, membership.id);
  const responsePromise = lookupTicketAsExhibitor(baseUrl, fixture.exhibitorToken, booking.qrCode);
  try {
    await waitForBlockedScannerAccess(held.blockerPid, "exhibitor_businesses");
  } finally {
    held.release();
    await held.transaction;
  }
  const response = await responsePromise;
  assert.equal(response.status, 404, "a revoked exhibitor member must not read visitor ticket data");
});

test("exhibitor scanner check-in waits for membership revocation and leaves the ticket unchanged", async () => {
  const fixture = await setUpConfirmedExhibitorWithPaidTicket("scanner-membership-revoke-checkin");
  const booking = await createFreeVisitorTicket("membership-revoke-checkin", fixture.firstExhibitionId, fixture.ticketTypeId);
  const membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: fixture.exhibitorUserId, status: "active" },
    select: { id: true, exhibitorBusinessId: true },
  });
  const held = await holdExhibitorBusinessRevocation(membership.exhibitorBusinessId, membership.id);
  const responsePromise = checkInAsExhibitor(baseUrl, fixture.exhibitorToken, booking.id);
  try {
    await waitForBlockedScannerAccess(held.blockerPid, "exhibitor_businesses");
  } finally {
    held.release();
    await held.transaction;
  }
  const response = await responsePromise;
  assert.equal(response.status, 404, "a revoked exhibitor member must not check in a visitor ticket");
  const unchanged = await prisma.ticketBooking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { checkInStatus: true },
  });
  assert.equal(unchanged.checkInStatus, false);
  assert.equal(await prisma.checkIn.count({ where: { ticketBookingId: booking.id } }), 0);
});

test("exhibitor scanner check-in waits for confirmed participation withdrawal and leaves the ticket unchanged", async () => {
  const fixture = await setUpConfirmedExhibitorWithPaidTicket("scanner-participation-withdrawal");
  const booking = await createFreeVisitorTicket("participation-withdrawal", fixture.firstExhibitionId, fixture.ticketTypeId);
  const held = await holdExhibitorParticipationWithdrawal(fixture.participationId);
  const responsePromise = checkInAsExhibitor(baseUrl, fixture.exhibitorToken, booking.id);
  try {
    await waitForBlockedScannerAccess(held.blockerPid, "exhibition_exhibitors");
  } finally {
    held.release();
    await held.transaction;
  }
  const response = await responsePromise;
  assert.equal(response.status, 404, "withdrawn participation must revoke scanner access");
  const unchanged = await prisma.ticketBooking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { checkInStatus: true },
  });
  assert.equal(unchanged.checkInStatus, false);
  assert.equal(await prisma.checkIn.count({ where: { ticketBookingId: booking.id } }), 0);
});

test("exhibitor staff can scan but cannot force a second check-in", async () => {
  const fixture = await setUpConfirmedExhibitorWithPaidTicket("scanner-staff-override");
  const booking = await createFreeVisitorTicket("staff-override", fixture.firstExhibitionId, fixture.ticketTypeId);
  const first = await checkInAsExhibitor(baseUrl, fixture.exhibitorToken, booking.id);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: fixture.exhibitorUserId, status: "active" },
    select: { id: true },
  });
  await prisma.exhibitorMembership.update({ where: { id: membership.id }, data: { role: "staff" } });
  const forced = await checkInAsExhibitor(baseUrl, fixture.exhibitorToken, booking.id, true);
  assert.equal(forced.status, 403, JSON.stringify(forced.body));
  assert.equal(await prisma.checkIn.count({ where: { ticketBookingId: booking.id } }), 1,
    "staff must not create an override CheckIn record");
});
