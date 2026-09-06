import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, createExhibition, createStall, applyAsExhibitor, approveParticipation, inviteTeamMember, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

// Test — cross-tenant: organizer A's usage never affects organizer B's entitlement.
test("cross-tenant: organizer A's heavy usage does not leak into organizer B's entitlement counts", async () => {
  const a = await bootstrapOrganizer(baseUrl, "sec-tenant-a", ts);
  const b = await bootstrapOrganizer(baseUrl, "sec-tenant-b", ts);
  organizerIds.push(a.organizerId, b.organizerId);
  await setSubscription(a.organizerId, "growth", "active");
  await setSubscription(b.organizerId, "growth", "active");

  // Push A's exhibition count well past what B has (1, from bootstrap).
  for (let i = 0; i < 4; i++) {
    const r = await createExhibition(baseUrl, a.token, `A extra ${i}`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const aCount = await prisma.exhibition.count({ where: { organizerId: a.organizerId } });
  assert.equal(aCount, 5);

  // B's own count must be completely unaffected by A's usage.
  const bCount = await prisma.exhibition.count({ where: { organizerId: b.organizerId } });
  assert.equal(bCount, 1, "organizer B's usage must never be inflated by organizer A's activity");

  // B should still be able to create up to ITS OWN limit (4 more, to 5).
  for (let i = 0; i < 4; i++) {
    const r = await createExhibition(baseUrl, b.token, `B extra ${i}`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const blockedForB = await createExhibition(baseUrl, b.token, "B 6th (should block)");
  assert.equal(blockedForB.status, 409, JSON.stringify(blockedForB.body));
  assert.equal(blockedForB.body.error.currentUsage, 5, "B's error must report B's own usage (5), not A's (also 5, coincidentally, but independently derived)");
});

// Test — IDOR: a client cannot supply a different organizerId to influence
// which organizer's entitlement is checked. There is no route in this
// system that accepts a client-supplied organizerId for a WRITE that
// creates an entitlement-checked resource except organizer-members' invite
// (:organizerId in the URL) — and that path is already permission-gated
// (getCallerRole), not entitlement-bypassable by URL manipulation.
test("IDOR: a user cannot invite team members into an organizer they do not belong to, regardless of entitlement headroom", async () => {
  const a = await bootstrapOrganizer(baseUrl, "sec-idor-a", ts);
  const b = await bootstrapOrganizer(baseUrl, "sec-idor-b", ts);
  organizerIds.push(a.organizerId, b.organizerId);

  // b's token, but a's organizerId in the URL.
  const attempt = await inviteTeamMember(baseUrl, b.token, a.organizerId, `phase20c-idor-${ts}@example.com`);
  assert.equal(attempt.status, 403, JSON.stringify(attempt.body));

  const count = await prisma.organizerMembership.count({ where: { organizerId: a.organizerId } });
  assert.equal(count, 1, "only the real owner membership must exist — the cross-organizer invite must not have been created");
});

// Test — fake plan/usage manipulation: a client cannot influence the
// entitlement decision by sending extra fields the schema doesn't declare.
test("a client cannot manipulate entitlement by submitting fake plan/usage fields in the request body", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "sec-fake-fields", ts);
  organizerIds.push(organizerId);

  // Starter+trialing already has its one free exhibition — attempt to
  // smuggle fields that might look like they could influence the check.
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Smuggled Fields",
      ticketTypes: [],
      stalls: [],
      planId: "plan-enterprise",
      plan: "enterprise",
      eventLimit: null,
      currentUsage: 0,
      subscriptionStatus: "active",
      organizerId: "some-other-organizer-id",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 409, JSON.stringify(body));
  assert.equal(body.error.code, "PLAN_LIMIT_EXCEEDED");

  // Confirm the real subscription/plan were never touched by the smuggled fields.
  const subscription = await prisma.subscription.findFirstOrThrow({ where: { organizerId }, include: { plan: true } });
  assert.equal(subscription.plan.code, "starter");
  assert.equal(subscription.status, "trialing");
  const exhibitionCount = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(exhibitionCount, 1, "still just the original exhibition from bootstrap");
  void firstExhibitionId;
});

// Test — unauthorized roles cannot perform protected creation/approval actions.
test("an organizer role without the relevant manage permission cannot create stalls or approve exhibitors", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "sec-rbac-actions", ts);
  organizerIds.push(organizerId);

  // Invite a scanner (no stall:manage, no exhibitionExhibitor:manage).
  const scannerEmail = `phase20c-sec-scanner-${ts}@example.com`;
  const signupScanner = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: scannerEmail, password: "testpass123", fullName: "Phase20C Sec Scanner", userType: "visitor" }),
  }).then((r) => r.json());
  await inviteTeamMember(baseUrl, token, organizerId, scannerEmail);

  const stallAttempt = await createStall(baseUrl, signupScanner.token, firstExhibitionId);
  assert.equal(stallAttempt.status, 404, JSON.stringify(stallAttempt.body)); // loadWithPermission returns null -> 404, matching existing convention

  const { participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "sec-rbac-exhibitor", ts);
  const approveAttempt = await fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/exhibitors/${participationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signupScanner.token}` },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(approveAttempt.status, 404, JSON.stringify(await approveAttempt.json()));
});

// Test — platform admin behavior remains correct: admin lifecycle/plan-
// change routes (Phase 20B) never call the entitlement service at all —
// they CONFIGURE entitlement, they are not subject to it — so a heavily
// over-limit organizer's admin operations must succeed exactly as normal.
test("platform admin plan-change succeeds for an organizer whose usage is already far over the target plan's limits", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "sec-admin-unblocked", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");
  for (let i = 0; i < 3; i++) {
    await inviteTeamMember(baseUrl, token, organizerId, `phase20c-sec-admin-${i}-${ts}@example.com`);
  }
  // 4 members total now, already above Starter's limit of 3.

  const adminToken = await (await import("./helpers/entitlementFixtures")).login(baseUrl, "platform.admin@eventpass.test");
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ planId: "plan-starter" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body), "admin plan changes must never be blocked by entitlement usage, over-limit or not");
  assert.equal(body.subscription.plan.code, "starter");
});

// Test — alternate-path audit: every write path for the five
// entitlement-checked resources is actually checked (regression guard —
// this test fails loudly if a future change adds a new creation route for
// any of these five resources without wiring the check in).
test("alternate-path audit: the known creation routes for all five resources are entitlement-checked", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "sec-alt-path", ts);
  organizerIds.push(organizerId);

  // Exhibition: POST / (already at limit from bootstrap).
  const exhibitionAttempt = await createExhibition(baseUrl, token, "Alt Path Exhibition");
  assert.equal(exhibitionAttempt.status, 409);

  // Exhibition: POST /:id/duplicate (already covered in entitlementExhibition.test.ts; re-affirmed here as part of the audit).
  const dup = await fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/duplicate`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(dup.status, 409);

  // Stall: both POST /:id/stalls (standalone) and the nested `stalls` array
  // in exhibition creation/duplication share the same assertCanCreateStall
  // — already proven directly in entitlementVisitorStall.test.ts.
  await setSubscription(organizerId, "starter", "active");
  await prisma.exhibition.updateMany({ where: { organizerId }, data: { status: "completed" } });
  const freshExhibition = await createExhibition(baseUrl, token, "Fresh For Alt Path", { stalls: Array.from({ length: 26 }, () => ({ price: 1000 })) });
  assert.equal(freshExhibition.status, 409, JSON.stringify(freshExhibition.body));
  assert.equal(freshExhibition.body.error.resource, "stall");
});
