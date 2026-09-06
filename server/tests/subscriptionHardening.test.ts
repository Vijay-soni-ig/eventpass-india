import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const createdUserIds: string[] = [];
const createdOrganizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  // cleanupOrganizers handles ticketBookings/stallBookings/payments/refunds/
  // exhibitions/memberships/organizer for everything scoped to these
  // organizer ids (see helpers/entitlementFixtures.ts) — reused here rather
  // than re-deriving the same deletion order.
  await cleanupOrganizers(createdOrganizerIds);
  if (createdOrganizerIds.length) {
    await prisma.auditLog.deleteMany({ where: { entityType: "Organizer", entityId: { in: createdOrganizerIds } } });
  }
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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

async function bootstrapOrganizer(label: string) {
  const email = `phase20d-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Phase20D ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);

  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ name: `Phase20D ${label} Exhibition`, ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  const organizerId = created.exhibition.organizerId as string;
  createdOrganizerIds.push(organizerId);
  return { userId: signup.user.id as string, token: signup.token as string, organizerId };
}

async function subscriptionOf(organizerId: string) {
  return prisma.subscription.findFirstOrThrow({ where: { organizerId } });
}

async function adminAction(token: string, organizerId: string, action: "activate" | "cancel" | "expire", body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function changePlanAction(token: string, organizerId: string, planId: string) {
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planId }),
  });
  return { status: res.status, body: await res.json() };
}

// Phase 20D — trialing -> cancelled is a newly-valid transition.
test("a still-trialing subscription can be cancelled directly through the real admin API", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("trial-cancel");

  const sub = await subscriptionOf(organizerId);
  assert.equal(sub.status, "trialing");

  const cancelled = await adminAction(adminToken, organizerId, "cancel");
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.subscription.status, "cancelled");

  const auditRow = await prisma.auditLog.findFirst({ where: { entityType: "Organizer", entityId: organizerId, action: "subscription.cancelled" } });
  assert.ok(auditRow, "cancelling from trialing must still be audited");
  const metadata = auditRow!.metadata as Record<string, unknown>;
  assert.equal(metadata.previousStatus, "trialing");
  assert.equal(metadata.newStatus, "cancelled");
});

// Concurrency — two simultaneous lifecycle transitions on the same
// subscription: exactly one must actually apply; the other must be
// correctly rejected against the now-current (post-first-transition) state,
// never silently overwritten (the lost-update race this phase's row
// locking specifically closes).
test("concurrency: two simultaneous cancel requests on the same active subscription — exactly one succeeds, no lost update", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("concurrent-cancel");
  await adminAction(adminToken, organizerId, "activate");

  const [a, b] = await Promise.all([adminAction(adminToken, organizerId, "cancel"), adminAction(adminToken, organizerId, "cancel")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 400], `expected exactly one 200 and one 400 (already-cancelled rejection), got ${JSON.stringify([a.status, b.status])}`);

  const rejected = a.status === 400 ? a : b;
  assert.equal(rejected.body.error.code, "INVALID_TRANSITION");

  const sub = await subscriptionOf(organizerId);
  assert.equal(sub.status, "cancelled");

  // Exactly one "subscription.cancelled" audit row — the loser never wrote one.
  const cancelledAudits = await prisma.auditLog.count({ where: { entityType: "Organizer", entityId: organizerId, action: "subscription.cancelled" } });
  assert.equal(cancelledAudits, 1, "the rejected concurrent request must not have produced its own audit row");
});

// Concurrency — two different concurrent plan changes: the row lock must
// serialize them so the final state is cleanly ONE of the two targets,
// never a corrupted/mixed result, and both requests get a consistent,
// truthful response.
test("concurrency: two simultaneous plan changes to different targets serialize cleanly, no corruption", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("concurrent-planchange");

  const [a, b] = await Promise.all([
    changePlanAction(adminToken, organizerId, "plan-growth"),
    changePlanAction(adminToken, organizerId, "plan-enterprise"),
  ]);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(b.status, 200, JSON.stringify(b.body));

  const finalSub = await subscriptionOf(organizerId);
  assert.ok(["plan-growth", "plan-enterprise"].includes(finalSub.planId), `final plan must be one of the two targets, got ${finalSub.planId}`);

  // Both responses must themselves be internally truthful (each reflects a
  // real, actually-committed state at the moment it ran) — not a race
  // where one response describes a plan that was never actually
  // persisted at that point.
  assert.ok(["plan-growth", "plan-enterprise"].includes(a.body.subscription.planId));
  assert.ok(["plan-growth", "plan-enterprise"].includes(b.body.subscription.planId));

  // Exactly two plan_changed audit rows (one per request — both requests
  // DID individually succeed, serialized, not one silently lost).
  const planChangeAudits = await prisma.auditLog.count({ where: { entityType: "Organizer", entityId: organizerId, action: "subscription.plan_changed" } });
  assert.equal(planChangeAudits, 2);
});

// Plan downgrade must preserve refund history too (Step 3's explicit
// requirement), not just Payment/PricingVersion (already covered in
// entitlementDowngrade.test.ts).
test("a plan downgrade never touches existing Refund records", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId, token, userId } = await bootstrapOrganizer("downgrade-refund-preserved");
  await adminAction(adminToken, organizerId, "activate");
  await changePlanAction(adminToken, organizerId, "plan-growth");

  // Create a real paid ticket + a real refund against it, under Growth.
  const visitorEmail = `phase20d-downgrade-refund-visitor-${ts}@example.com`;
  const visitorSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: visitorEmail, password: "testpass123", fullName: "Refund Visitor", userType: "visitor" }),
  }).then((r) => r.json());
  createdUserIds.push(visitorSignup.user.id);

  const exhibitionId = (await prisma.exhibition.findFirstOrThrow({ where: { organizerId } })).id;
  // The bootstrap exhibition defaults to status "draft" — ticket booking
  // requires "live" + public visibility (routes/bookings.ts), so make it
  // live first.
  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "live", visibility: "public" } });
  const ticketType = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Paid", price: 500, quantity: 100 }),
  }).then((r) => r.json());

  const booking = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorSignup.token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId: ticketType.ticket.id, attendeeName: "Refund Visitor", attendeeEmail: visitorEmail, quantity: 1 }),
  }).then((r) => r.json());
  await fetch(`${baseUrl}/api/payments/${booking.payment.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorSignup.token}` },
    body: JSON.stringify({ outcome: "success" }),
  });

  const refundRes = await fetch(`${baseUrl}/api/organizer/payments/${booking.payment.id}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason: "CUSTOMER_REQUEST", idempotencyKey: `phase20d-downgrade-${ts}` }),
  }).then((r) => r.json());
  await fetch(`${baseUrl}/api/organizer/payments/${booking.payment.id}/refunds/${refundRes.refund.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ outcome: "success" }),
  });

  const refundBefore = await prisma.refund.findUniqueOrThrow({ where: { id: refundRes.refund.id } });
  assert.equal(refundBefore.status, "SUCCEEDED");
  assert.equal(Number(refundBefore.amount), 500);

  // Downgrade to Starter — well within limits here, just verifying the refund is untouched.
  const downgraded = await changePlanAction(adminToken, organizerId, "plan-starter");
  assert.equal(downgraded.status, 200, JSON.stringify(downgraded.body));

  const refundAfter = await prisma.refund.findUniqueOrThrow({ where: { id: refundRes.refund.id } });
  assert.deepEqual(refundBefore, refundAfter, "the Refund row must be byte-for-byte identical after an unrelated plan change");

  void userId;
});

// Structured error contract consistency: both entitlement AND subscription
// lifecycle errors now use the identical {error: {code, message, ...}}
// shape — a client can rely on one extraction path for both.
test("subscription lifecycle errors and entitlement errors share the same structured {error: {code, message}} contract", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId, token } = await bootstrapOrganizer("error-contract");

  // Subscription-lifecycle error (PLAN_NOT_FOUND).
  const badPlan = await changePlanAction(adminToken, organizerId, "no-such-plan-id");
  assert.equal(typeof badPlan.body.error, "object");
  assert.equal(typeof badPlan.body.error.code, "string");
  assert.equal(typeof badPlan.body.error.message, "string");

  // Entitlement error (PLAN_LIMIT_EXCEEDED) — Starter+trialing already used its one exhibition.
  const blockedExhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Second", ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  assert.equal(typeof blockedExhibition.error, "object");
  assert.equal(typeof blockedExhibition.error.code, "string");
  assert.equal(typeof blockedExhibition.error.message, "string");
  assert.equal(blockedExhibition.error.resource, "exhibition");
});

// Request tampering: a client cannot influence a lifecycle transition or
// plan change by supplying extra/fake fields the schema doesn't declare.
test("tampered fields in a plan-change request body are ignored — server state is authoritative", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("tamper-planchange");

  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      planId: "plan-growth",
      status: "active", // not part of changePlanSchema — must be silently ignored, not applied
      organizerId: "some-other-organizer-id",
      currentUsage: 0,
      limit: null,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.subscription.plan.code, "growth");
  assert.equal(body.subscription.status, "trialing", "the smuggled status:\"active\" must be ignored — only planId is a real field");

  const sub = await subscriptionOf(organizerId);
  assert.equal(sub.organizerId, organizerId, "the smuggled organizerId must never redirect the write to another organizer");
});
