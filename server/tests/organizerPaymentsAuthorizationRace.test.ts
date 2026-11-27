import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import {
  bootstrapOrganizer,
  createExhibition,
  cleanupOrganizers,
  setSubscription,
  applyAsExhibitor,
  approveParticipation,
  createStall,
} from "./helpers/entitlementFixtures";
import { signupUser, selectStall, initiatePayment } from "./helpers/phase21bFixtures";
import { holdOrganizerMembershipChange, waitForBlockedOrganizerAccess } from "./helpers/organizerLockRace";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];
const paymentIds: string[] = [];

async function waitForBlockedOrganizerAccessCount(blockerPid: number, expectedCount: number, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND state = 'active'
        AND ${blockerPid} = ANY(pg_blocking_pids(pid))
    `;
    // Count every session blocked by this exact transaction. Filtering on the
    // rendered SQL text was brittle across Prisma/PostgreSQL query formatting.
    // Release well before the API's 5-second interactive-transaction timeout.
    if ((waiting[0]?.count ?? 0) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for " + expectedCount + " organizer payment requests to block on the organizer lock");
}

before(async () => {
  process.env.NODE_ENV = "test";
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.ticketBooking.deleteMany({ where: { exhibition: { organizerId: { in: organizerIds } } } });
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Payment", entityId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  }
  if (visitorUserIds.length) await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function createVisitorPaymentFixture(label: string) {
  const owner = await bootstrapOrganizer(baseUrl, "organizer-payment-race-owner-" + label, ts + organizerIds.length);
  const finance = await bootstrapOrganizer(baseUrl, "organizer-payment-race-finance-" + label, ts + organizerIds.length + 100);
  organizerIds.push(owner.organizerId, finance.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  const membership = await prisma.organizerMembership.create({
    data: { organizerId: owner.organizerId, userId: finance.userId, role: "finance", status: "active" },
  });

  const created = await createExhibition(baseUrl, owner.token, "Organizer Payment Race " + label, {
    status: "live",
    visibility: "public",
    startDate: "2030-02-01",
    endDate: "2030-02-02",
    venue: "Organizer Payment Race Venue",
    city: "Ahmedabad",
    ticketTypes: [{ name: "Free Race Ticket", price: 0, quantity: 10, taxPercent: 0, visible: true }],
    stalls: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const exhibitionId = created.body.exhibition.id as string;
  const ticketTypeId = created.body.exhibition.ticketTypes[0].id as string;
  const email = "organizer-payment-race-" + label + "-" + ts + "@example.com";
  const visitor = await signupUser(baseUrl, email, "Organizer Payment Race Visitor", "visitor");
  visitorUserIds.push(visitor.userId);

  const bookingResponse = await fetch(baseUrl + "/api/bookings/tickets", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      exhibitionId,
      ticketTypeId,
      attendeeName: "Organizer Payment Race Visitor",
      attendeeEmail: email,
      quantity: 1,
    }),
  });
  const bookingBody = await bookingResponse.json();
  assert.equal(bookingResponse.status, 201, JSON.stringify(bookingBody));
  const paymentId = bookingBody.payment.id as string;
  paymentIds.push(paymentId);
  return { owner, finance, membership, exhibitionId, paymentId };
}

async function createStallPaymentFixture(label: string) {
  const owner = await bootstrapOrganizer(baseUrl, "organizer-payment-mutation-owner-" + label, ts + organizerIds.length + 200);
  const admin = await bootstrapOrganizer(baseUrl, "organizer-payment-mutation-admin-" + label, ts + organizerIds.length + 300);
  organizerIds.push(owner.organizerId, admin.organizerId);
  const membership = await prisma.organizerMembership.create({
    data: { organizerId: owner.organizerId, userId: admin.userId, role: "admin", status: "active" },
  });

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    owner.firstExhibitionId,
    "organizer-payment-race-exhibitor-" + label,
    ts + organizerIds.length,
  );
  await approveParticipation(baseUrl, owner.token, owner.firstExhibitionId, exhibitor.participationId);
  const stall = await createStall(baseUrl, owner.token, owner.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));
  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  return { owner, admin, membership, paymentId, stallId: stall.body.stall.id };
}

test("payment list revalidates payment:view after an organizer role downgrade", async () => {
  const fixture = await createVisitorPaymentFixture("list-downgrade");
  const held = await holdOrganizerMembershipChange(fixture.owner.organizerId, fixture.membership.id, "downgrade");
  const responsePromise = fetch(baseUrl + "/api/organizer/payments?exhibitionId=" + fixture.exhibitionId, {
    headers: { Authorization: "Bearer " + fixture.finance.token },
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 200);
  const body = await response.json() as {
    bookings: Array<{ paymentId: string | null }>;
    ticketBookings: Array<{ paymentId: string | null }>;
  };
  assert.equal(body.bookings.some((booking) => booking.paymentId === fixture.paymentId), false);
  assert.equal(body.ticketBookings.some((booking) => booking.paymentId === fixture.paymentId), false);
});

test("payment detail and refund history revalidate payment:view after membership revocation", async () => {
  const fixture = await createVisitorPaymentFixture("detail-revocation");
  const held = await holdOrganizerMembershipChange(fixture.owner.organizerId, fixture.membership.id, "revoke");
  const detailPromise = fetch(baseUrl + "/api/organizer/payments/" + fixture.paymentId, {
    headers: { Authorization: "Bearer " + fixture.finance.token },
  });
  const refundsPromise = fetch(baseUrl + "/api/organizer/payments/" + fixture.paymentId + "/refunds", {
    headers: { Authorization: "Bearer " + fixture.finance.token },
  });
  try {
    await waitForBlockedOrganizerAccessCount(held.blockerPid, 2);
  } finally {
    held.release();
    await held.transaction;
  }

  const [detail, refunds] = await Promise.all([detailPromise, refundsPromise]);
  assert.equal(detail.status, 404);
  assert.equal(refunds.status, 404);
});

test("manual payment status mutation is denied after payment:manage is revoked while waiting for the organizer lock", async () => {
  const fixture = await createStallPaymentFixture("manual-downgrade");
  const held = await holdOrganizerMembershipChange(fixture.owner.organizerId, fixture.membership.id, "downgrade");
  const responsePromise = fetch(baseUrl + "/api/organizer/payments/" + fixture.paymentId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + fixture.admin.token, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "paid", gateway: "manual", gatewayRefId: "race-manual-" + ts }),
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  const booking = await prisma.stallBooking.findFirstOrThrow({ where: { paymentId: fixture.paymentId } });
  assert.equal(payment.status, "created");
  assert.equal(booking.paymentStatus, "created");
  assert.equal(await prisma.auditLog.count({
    where: { entityType: "Payment", entityId: fixture.paymentId, action: "payment.status.manually_updated" },
  }), 0);
});

test("refund reservation is denied after payment:manage membership is revoked while waiting for the organizer lock", async () => {
  const fixture = await createStallPaymentFixture("refund-revocation");
  await prisma.payment.update({
    where: { id: fixture.paymentId },
    data: { status: "paid", providerPaymentId: "race-captured-" + ts },
  });
  await prisma.stallBooking.update({ where: { paymentId: fixture.paymentId }, data: { paymentStatus: "paid" } });

  const held = await holdOrganizerMembershipChange(fixture.owner.organizerId, fixture.membership.id, "revoke");
  const responsePromise = fetch(baseUrl + "/api/organizer/payments/" + fixture.paymentId + "/refund", {
    method: "POST",
    headers: { Authorization: "Bearer " + fixture.admin.token, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "CUSTOMER_REQUEST", idempotencyKey: "race-refund-" + ts }),
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  assert.equal(payment.status, "paid");
  assert.equal(Number(payment.refundedAmount), 0);
  assert.equal(await prisma.refund.count({ where: { paymentId: fixture.paymentId } }), 0);
});
