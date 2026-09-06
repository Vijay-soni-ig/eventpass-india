import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";

/** Phase 21B test fixtures — small helpers for the exhibitor payment-retry, scanner, and booking-idempotency fixes, layered on top of the Phase 20C helpers already used across the suite. */

export async function signupUser(baseUrl: string, email: string, fullName: string, userType: "exhibitor" | "visitor" = "exhibitor") {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName, userType }),
  }).then((r) => r.json());
  assert.ok(signup.token, `signup must succeed for ${email}: ${JSON.stringify(signup)}`);
  return { userId: signup.user.id as string, token: signup.token as string };
}

export async function selectStall(baseUrl: string, exhibitorToken: string, participationId: string, stallId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitor/participations/${participationId}/stall`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify({ stallId }),
  });
  return { status: res.status, body: await res.json() };
}

export async function initiatePayment(baseUrl: string, exhibitorToken: string, participationId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitor/participations/${participationId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${exhibitorToken}` },
  });
  return { status: res.status, body: await res.json() };
}

export async function mockComplete(baseUrl: string, token: string, paymentId: string, outcome: "success" | "failure") {
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ outcome }),
  });
  return { status: res.status, body: await res.json() };
}

export async function createTicketType(baseUrl: string, organizerToken: string, exhibitionId: string, price = 500) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ name: "Standard", price, quantity: 1000 }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.ticket.id as string;
}

export async function bookTicket(
  baseUrl: string,
  buyerToken: string,
  exhibitionId: string,
  ticketTypeId: string,
  attendeeEmail: string,
  idempotencyKey?: string
) {
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyerToken}`,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Buyer", attendeeEmail, quantity: 1 }),
  });
  return { status: res.status, body: await res.json() };
}

export async function lookupTicketAsExhibitor(baseUrl: string, exhibitorToken: string, qrCode: string) {
  const res = await fetch(`${baseUrl}/api/exhibitor/scanner/lookup/${encodeURIComponent(qrCode)}`, {
    headers: { Authorization: `Bearer ${exhibitorToken}` },
  });
  return { status: res.status, body: await res.json() };
}

export async function checkInAsExhibitor(baseUrl: string, exhibitorToken: string, bookingId: string, force = false) {
  const res = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${bookingId}/check-in`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify(force ? { force } : {}),
  });
  return { status: res.status, body: await res.json() };
}

/**
 * Deletes any Payment with no linked TicketBooking/StallBooking, regardless
 * of provider — the losing side of a concurrent idempotency-key race
 * legitimately creates exactly this (a real, accepted trade-off documented
 * in routes/bookings.ts: holding a DB lock across the gateway-order call
 * would be worse). Broader than entitlementFixtures.ts's
 * cleanupOrphanFreePayments (which only targets provider:"free"), since the
 * idempotency race can orphan a priced ("mock" provider) payment too.
 *
 * Age-gated (>30s old) — Node's test runner executes multiple test files
 * concurrently, each against the same real database, and EVERY booking
 * route momentarily has its Payment committed before its TicketBooking (see
 * routes/bookings.ts's own comment on this exact window). An unscoped
 * cleanup running from one test file could delete a payment another test
 * file's in-flight request created microseconds earlier but hasn't yet
 * attached to a booking — a real cross-file race this project hit once
 * already (a spurious `ticket_bookings_paymentId_fkey` violation in an
 * unrelated file). 30s is far longer than any single request takes, so a
 * payment that old and still unlinked is genuinely abandoned, never
 * mid-flight.
 */
export async function cleanupOrphanPayments() {
  const orphans = await prisma.payment.findMany({
    where: { ticketBooking: { is: null }, stallBooking: { is: null }, createdAt: { lt: new Date(Date.now() - 30_000) } },
    select: { id: true },
  });
  if (orphans.length === 0) return;
  await prisma.payment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
}
