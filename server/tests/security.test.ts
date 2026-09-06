import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const email = `phase19a-security-${ts}@example.com`;
let userId: string | undefined;
let createdBookingId: string | undefined;
let createdPaymentId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (createdBookingId) await prisma.ticketBooking.deleteMany({ where: { id: createdBookingId } });
  if (createdPaymentId) await prisma.payment.deleteMany({ where: { id: createdPaymentId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await stop();
  await prisma.$disconnect();
});

// Test 9 — client cannot control the payment amount.
test("a client cannot manipulate the charged amount: the server always recomputes from the database, ignoring any client-supplied amount/price field", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: "Phase19A Security Test", userType: "visitor" }),
  }).then((r) => r.json());
  assert.ok(signup.token, "signup must succeed for this test to proceed");
  userId = signup.user.id;

  // seed-tickettype-standard is priced at ₹499 in the dev seed. Attempt to
  // smuggle a client-controlled amount alongside the legitimate fields —
  // the request schema (createTicketBookingSchema) doesn't declare `amount`,
  // `price`, or `unitPrice` as accepted fields at all, so zod's default
  // "strip unrecognized keys" behavior discards them before the route body
  // ever sees them; this test proves that end to end, not just by reading
  // the schema.
  const bookingResp = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      exhibitionId: "seed-exhibition-1",
      ticketTypeId: "seed-tickettype-standard",
      attendeeName: "Phase19A Security Test",
      attendeeEmail: email,
      quantity: 1,
      amount: 1,
      price: 1,
      unitPrice: 1,
      totalAmount: 1,
    }),
  });
  const booking = await bookingResp.json();
  assert.equal(bookingResp.status, 201, `booking creation should succeed: ${JSON.stringify(booking)}`);
  createdBookingId = booking.booking.id;
  createdPaymentId = booking.payment.id;

  // The real ticket price (₹499), not the attacker-supplied ₹1, must be
  // what was actually charged.
  assert.equal(Number(booking.payment.amount), 499, "server must charge the real DB price, not the client-supplied amount");
  assert.equal(Number(booking.payment.baseAmount), 499);
  assert.notEqual(Number(booking.payment.amount), 1, "the tampered amount=1 must never reach the Payment record");

  const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: booking.payment.id } });
  assert.equal(Number(dbPayment.amount), 499, "the database record itself, not just the API response, must reflect the real price");
});
