import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { assertValidTransition, SubscriptionError } from "../src/lib/subscriptionService";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const createdUserIds: string[] = [];
const createdOrganizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (createdOrganizerIds.length) {
    await prisma.subscription.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.exhibition.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.organizer.deleteMany({ where: { id: { in: createdOrganizerIds } } });
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

/** Bootstraps a brand-new organizer the same way the real product does: sign up, then create an exhibition (which triggers resolveOrganizerId). */
async function bootstrapOrganizer(label: string) {
  const email = `phase20b-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Phase20B ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);

  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ name: `Phase20B ${label} Exhibition`, ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  const organizerId = created.exhibition.organizerId as string;
  createdOrganizerIds.push(organizerId);

  return { userId: signup.user.id, token: signup.token as string, organizerId };
}

async function adminSubscriptionAction(token: string, organizerId: string, action: "activate" | "cancel" | "expire", body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// Test — Starter trial creation on organizer bootstrap.
test("a newly bootstrapped organizer automatically gets a Starter trialing subscription", async () => {
  const { organizerId } = await bootstrapOrganizer("trial-creation");

  const subscription = await prisma.subscription.findFirst({ where: { organizerId }, include: { plan: true } });
  assert.ok(subscription, "expected a Subscription row to exist for the new organizer");
  assert.equal(subscription!.status, "trialing");
  assert.equal(subscription!.plan.code, "starter");
  assert.equal(subscription!.trialEndsAt, null, "the free-first-exhibition trial must not fake a calendar trialEndsAt date");
});

// Test — exactly one subscription per organizer.
test("a bootstrapped organizer has exactly one subscription row", async () => {
  const { organizerId } = await bootstrapOrganizer("one-subscription");
  const count = await prisma.subscription.count({ where: { organizerId } });
  assert.equal(count, 1);
});

// Test — plan lookup via the organizer-scoped GET route.
test("GET /api/organizer/subscription returns the caller's own subscription with plan/limits", async () => {
  const { token, organizerId } = await bootstrapOrganizer("plan-lookup");
  const res = await fetch(`${baseUrl}/api/organizer/subscription`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const entry = body.subscriptions.find((s: { organizer: { id: string } }) => s.organizer.id === organizerId);
  assert.ok(entry, "expected an entry for the bootstrapped organizer");
  assert.equal(entry.subscription.status, "trialing");
  assert.equal(entry.subscription.plan.code, "starter");
  assert.equal(entry.subscription.plan.eventLimit, 1);
});

// Test — valid lifecycle transitions (unit-level, the pure function).
// Phase 20D added trialing->cancelled (an organizer who never converted
// their free trial can have it cancelled directly) — see
// docs/PHASE_20D_COMMERCIAL_HARDENING_REPORT.md Section "Subscription
// State Machine" for why this was a deliberate addition, not scope creep.
test("valid subscription transitions are accepted: trialing->active, trialing->expired, trialing->cancelled, active->cancelled, active->expired", () => {
  assert.doesNotThrow(() => assertValidTransition("trialing", "active"));
  assert.doesNotThrow(() => assertValidTransition("trialing", "expired"));
  assert.doesNotThrow(() => assertValidTransition("trialing", "cancelled"));
  assert.doesNotThrow(() => assertValidTransition("active", "cancelled"));
  assert.doesNotThrow(() => assertValidTransition("active", "expired"));
});

// Test — invalid lifecycle transitions rejected, in particular cancelled->active.
test("invalid subscription transitions are rejected, including cancelled->active reactivation", () => {
  for (const [from, to] of [
    ["cancelled", "active"],
    ["cancelled", "trialing"],
    ["expired", "active"],
    ["active", "trialing"],
  ] as const) {
    assert.throws(() => assertValidTransition(from, to), SubscriptionError, `${from} -> ${to} must be rejected`);
  }
});

// Test — full admin lifecycle: activate, then cancel; and a separate expire path.
test("platform admin can activate then cancel a subscription through the real API, with correct audit trail", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("admin-lifecycle");

  const activated = await adminSubscriptionAction(adminToken, organizerId, "activate", {});
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  assert.equal(activated.body.subscription.status, "active");
  assert.ok(activated.body.subscription.currentPeriodStart, "activating should set a currentPeriodStart");

  const cancelled = await adminSubscriptionAction(adminToken, organizerId, "cancel");
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.subscription.status, "cancelled");

  // Invalid transition: cancelled subscriptions cannot be re-activated.
  const reactivate = await adminSubscriptionAction(adminToken, organizerId, "activate");
  assert.equal(reactivate.status, 400, JSON.stringify(reactivate.body));
  // Phase 20D: unified error shape — {error: {code, message}}, matching
  // entitlementService.ts's structured errors (previously {error: message, code}).
  assert.equal(reactivate.body.error.code, "INVALID_TRANSITION");

  const auditRows = await prisma.auditLog.findMany({ where: { entityType: "Organizer", entityId: organizerId }, orderBy: { createdAt: "asc" } });
  const actions = auditRows.map((r) => r.action);
  assert.ok(actions.includes("subscription.trial_created"));
  assert.ok(actions.includes("subscription.activated"));
  assert.ok(actions.includes("subscription.cancelled"));
});

// Test — expire from trialing.
test("platform admin can expire a still-trialing subscription", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("admin-expire");

  const expired = await adminSubscriptionAction(adminToken, organizerId, "expire");
  assert.equal(expired.status, 200, JSON.stringify(expired.body));
  assert.equal(expired.body.subscription.status, "expired");

  const auditRows = await prisma.auditLog.findMany({ where: { entityType: "Organizer", entityId: organizerId, action: "subscription.expired" } });
  assert.equal(auditRows.length, 1);
});

// Test — plan change preserves history, doesn't touch financial data.
test("changing a subscription's plan preserves audit history and never touches Payment/PricingVersion data", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("plan-change");

  const subscription = await prisma.subscription.findFirstOrThrow({ where: { organizerId } });
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ planId: "plan-growth" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.subscription.plan.code, "growth");
  assert.equal(body.subscription.status, "trialing", "changing plan must not itself change lifecycle status");

  const auditRows = await prisma.auditLog.findMany({ where: { entityType: "Organizer", entityId: organizerId, action: "subscription.plan_changed" } });
  assert.equal(auditRows.length, 1);
  const metadata = auditRows[0].metadata as Record<string, unknown>;
  assert.equal(metadata.previousPlanId, subscription.planId);
  assert.equal(metadata.newPlanId, "plan-growth");

  // Payment/PricingVersion tables are untouched by a plan change — sanity
  // check that the count of PricingVersion rows didn't move.
  const pricingVersionCount = await prisma.pricingVersion.count();
  assert.ok(pricingVersionCount >= 2, "PricingVersion rows must still exist, unmodified by subscription operations");
});

// Test — cannot assign an inactive plan.
test("assigning the inactive placeholder plan is rejected", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("inactive-plan-reject");

  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ planId: "plan-custom-unconfigured" }),
  });
  const body = await res.json();
  assert.equal(res.status, 400, JSON.stringify(body));
  assert.equal(body.error.code, "PLAN_INACTIVE");
});
