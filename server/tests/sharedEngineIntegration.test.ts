import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { getActivePricingVersion } from "../src/lib/pricingVersion";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

// Cleanup bookkeeping — precise, only what this file creates/mutates.
let ticketBookingId: string | undefined;
let ticketPaymentId: string | undefined;
let stallBookingId: string | undefined;
let stallPaymentId: string | undefined;
let visitorUserId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (ticketBookingId) await prisma.ticketBooking.deleteMany({ where: { id: ticketBookingId } });
  if (ticketPaymentId) await prisma.payment.deleteMany({ where: { id: ticketPaymentId } });
  if (visitorUserId) await prisma.user.deleteMany({ where: { id: visitorUserId } });

  // Revert the seed stall/participation back to their original state
  // (biz3 seeded as "applied", seed-stall-a05 seeded as "available") —
  // same revert pattern used throughout this project's live test history.
  if (stallBookingId) {
    await prisma.stallBooking.deleteMany({ where: { id: stallBookingId } });
  }
  if (stallPaymentId) {
    await prisma.payment.deleteMany({ where: { id: stallPaymentId } });
  }
  await prisma.stall.updateMany({ where: { id: "seed-stall-a05" }, data: { status: "available", exhibitionExhibitorId: null } });
  await prisma.exhibitionExhibitor.updateMany({ where: { id: "seed-participation-biz3" }, data: { status: "applied", boothNumber: null } });

  await stop();
  await prisma.$disconnect();
});

async function login(email: string, password = "DevPassword123!") {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => res.json());
  assert.ok(r.token, `login must succeed for ${email}: ${JSON.stringify(r)}`);
  return r.token as string;
}

// Test 10 — ticket and stall flows use the same pricing engine.
test("a ticket booking and a stall payment both created under the same active PricingVersion, via the same shared engine", async () => {
  const activeVersion = await getActivePricingVersion();

  // --- Ticket side ---
  const visitorEmail = `phase19a-shared-engine-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: visitorEmail, password: "testpass123", fullName: "Phase19A Shared Engine", userType: "visitor" }),
  }).then((r) => r.json());
  visitorUserId = signup.user.id;

  const ticketResp = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      exhibitionId: "seed-exhibition-1",
      ticketTypeId: "seed-tickettype-vip",
      attendeeName: "Phase19A Shared Engine",
      attendeeEmail: visitorEmail,
      quantity: 1,
    }),
  }).then((r) => r.json());
  ticketBookingId = ticketResp.booking.id;
  ticketPaymentId = ticketResp.payment.id;

  // --- Stall side (biz3: applied -> approved -> select stall -> pay) ---
  const organizerToken = await login("org1.owner@eventpass.test");
  const biz3Token = await login("biz3.owner@eventpass.test");

  const approve = await fetch(`${baseUrl}/api/exhibitions/seed-exhibition-1/exhibitors/seed-participation-biz3`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ status: "approved" }),
  }).then((r) => r.json());
  assert.equal(approve.participant?.status, "approved", `approval must succeed: ${JSON.stringify(approve)}`);

  const select = await fetch(`${baseUrl}/api/exhibitor/participations/seed-participation-biz3/stall`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${biz3Token}` },
    body: JSON.stringify({ stallId: "seed-stall-a05" }),
  }).then((r) => r.json());
  assert.equal(select.participation?.status, "stall_reserved", `stall selection must succeed: ${JSON.stringify(select)}`);

  const stallPay = await fetch(`${baseUrl}/api/exhibitor/participations/seed-participation-biz3/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${biz3Token}` },
  }).then((r) => r.json());
  assert.ok(stallPay.payment?.id, `stall payment initiation must succeed: ${JSON.stringify(stallPay)}`);
  stallBookingId = stallPay.booking.id;
  stallPaymentId = stallPay.payment.id;

  // --- The actual assertion: both payments reference the SAME active
  // pricing version, proving both flows went through the identical shared
  // engine (calculatePricing(), invoked only from
  // lib/paymentService.ts's createOrderForPayment()) rather than two
  // independent formulas. ---
  const [ticketPayment, stallPaymentRow] = await Promise.all([
    prisma.payment.findUniqueOrThrow({ where: { id: ticketPaymentId! } }),
    prisma.payment.findUniqueOrThrow({ where: { id: stallPaymentId! } }),
  ]);

  assert.equal(ticketPayment.pricingVersionId, activeVersion.id);
  assert.equal(stallPaymentRow.pricingVersionId, activeVersion.id);
  assert.equal(ticketPayment.pricingVersionId, stallPaymentRow.pricingVersionId);
  // Same fee/tax treatment applied identically to both (both currently 0
  // under the launch pricing version).
  assert.equal(Number(ticketPayment.platformFeeAmount), Number(stallPaymentRow.platformFeeAmount));
  assert.equal(Number(ticketPayment.taxAmount), Number(stallPaymentRow.taxAmount));
});
