import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

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
  assert.ok(r.token, `login must succeed for ${email}`);
  return r.token as string;
}

async function signupExhibitorTyped(label: string) {
  const email = `phase20b-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Phase20B ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);
  return { userId: signup.user.id, token: signup.token as string };
}

async function bootstrapOrganizer(label: string) {
  const { userId, token } = await signupExhibitorTyped(label);
  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Phase20B ${label} Exhibition`, ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  const organizerId = created.exhibition.organizerId as string;
  createdOrganizerIds.push(organizerId);
  return { userId, token, organizerId };
}

// Test — tenant isolation on the organizer-scoped GET route.
test("organizer A cannot see organizer B's subscription via the self-service GET route", async () => {
  const a = await bootstrapOrganizer("tenant-a");
  const b = await bootstrapOrganizer("tenant-b");

  const res = await fetch(`${baseUrl}/api/organizer/subscription`, { headers: { Authorization: `Bearer ${a.token}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const organizerIds = body.subscriptions.map((s: { organizer: { id: string } }) => s.organizer.id);
  assert.ok(organizerIds.includes(a.organizerId), "A must see A's own subscription");
  assert.ok(!organizerIds.includes(b.organizerId), "A must NEVER see B's subscription");
});

// Test — unauthenticated requests rejected.
test("unauthenticated requests cannot read subscription data", async () => {
  const res = await fetch(`${baseUrl}/api/organizer/subscription`);
  assert.equal(res.status, 401);
});

// Test — a normal organizer (non-platform-admin) cannot call platform admin lifecycle routes.
test("a normal organizer owner cannot perform platform-admin subscription lifecycle actions", async () => {
  const { token, organizerId } = await bootstrapOrganizer("not-admin");

  const activate = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assert.equal(activate.status, 403, "a non-platform-admin must be rejected, not silently allowed");

  const cancel = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  assert.equal(cancel.status, 403);
});

// Test — cross-tenant IDOR: organizer A cannot use the platform-admin-shaped
// URL against organizer B even if they somehow guessed the id (still 403,
// since the gate is role-based, not organizer-scoped, for this route).
test("a normal organizer cannot manipulate ANY organizer's subscription via the admin route, including their own", async () => {
  const { token, organizerId } = await bootstrapOrganizer("idor-check");
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403, "requirePlatformAdmin must reject a non-admin regardless of whose organizer id is in the URL");
});

// Test — platform admin authorization actually works (positive case).
test("platform admin can read any organizer's subscription", async () => {
  const adminToken = await login("platform.admin@eventpass.test");
  const { organizerId } = await bootstrapOrganizer("admin-can-read");

  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.subscription.status, "trialing");
  assert.equal(body.subscription.plan.code, "starter");
});

// Test — concurrent organizer bootstrap for the same user.
//
// Phase 20C note: since Starter+trialing now permits only ONE exhibition
// ever (the free-first-exhibition entitlement — see entitlementService.ts),
// of these two concurrent exhibition-creation requests exactly one is
// expected to succeed and the other to be correctly rejected with
// PLAN_LIMIT_EXCEEDED, not both succeeding as they did before Phase 20C's
// enforcement existed. The organizer-bootstrap-concurrency guarantee this
// test actually cares about is verified directly against the database
// (organizer/membership/subscription row counts), not by both responses
// looking alike.
test("two concurrent organizer-bootstrap requests for the same user produce exactly one organizer and exactly one Starter subscription", async () => {
  const { userId, token } = await signupExhibitorTyped("concurrent-bootstrap");

  const [a, b] = await Promise.all([
    fetch(`${baseUrl}/api/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Concurrent Bootstrap A", ticketTypes: [], stalls: [] }),
    }).then((r) => r.json()),
    fetch(`${baseUrl}/api/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Concurrent Bootstrap B", ticketTypes: [], stalls: [] }),
    }).then((r) => r.json()),
  ]);

  const succeeded = [a, b].filter((r) => r.exhibition?.organizerId);
  const blocked = [a, b].filter((r) => r.error?.code === "PLAN_LIMIT_EXCEEDED");
  assert.equal(succeeded.length, 1, `exactly one of the two concurrent exhibition creations should succeed (Starter's free-first-exhibition entitlement): ${JSON.stringify([a, b])}`);
  assert.equal(blocked.length, 1, `the other must be blocked by the trial-consumed check, not fail for some other reason: ${JSON.stringify([a, b])}`);

  const organizerId = succeeded[0].exhibition.organizerId as string;
  createdOrganizerIds.push(organizerId);

  const organizerCount = await prisma.organizer.count({ where: { bootstrappedByUserId: userId } });
  assert.equal(organizerCount, 1, "exactly one Organizer must exist for this user, even after two concurrent bootstrap attempts");

  const ownerMembershipCount = await prisma.organizerMembership.count({ where: { organizerId, userId, role: "owner" } });
  assert.equal(ownerMembershipCount, 1, "exactly one owner membership");

  const subscriptionCount = await prisma.subscription.count({ where: { organizerId } });
  assert.equal(subscriptionCount, 1, "exactly one Subscription must exist, never two, under concurrent bootstrap");

  const subscription = await prisma.subscription.findFirstOrThrow({ where: { organizerId }, include: { plan: true } });
  assert.equal(subscription.status, "trialing");
  assert.equal(subscription.plan.code, "starter");

  // Both requests targeted organizer bootstrap for the SAME user — confirm
  // the blocked request's rejection genuinely came from the same single
  // organizer's entitlement, not a stray second one.
  const exhibitionCount = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(exhibitionCount, 1, "exactly one exhibition should have been created, not two");
});
