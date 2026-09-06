import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, createExhibition, markExhibitionCompleted, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

// Test — first free exhibition (already exercised implicitly by bootstrap
// succeeding in every other test file, but asserted explicitly here).
test("a brand-new Starter+trialing organizer's first exhibition is created for free", async () => {
  const { organizerId } = await bootstrapOrganizer(baseUrl, "first-free", ts);
  organizerIds.push(organizerId);
  const count = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(count, 1);
});

// Test — second Starter exhibition blocked (trial consumed).
test("a second exhibition on a still-trialing Starter subscription is blocked with PLAN_LIMIT_EXCEEDED", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "second-blocked", ts);
  organizerIds.push(organizerId);

  const second = await createExhibition(baseUrl, token, "Second Exhibition");
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(second.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(second.body.error.resource, "exhibition");
  assert.equal(second.body.error.plan, "Starter");
  assert.equal(second.body.error.action, "upgrade");

  const count = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(count, 1, "the blocked request must not have created anything");
});

// Test — Growth boundary (5 non-completed exhibitions allowed, 6th blocked).
test("Growth allows exactly 5 non-completed exhibitions, blocks the 6th", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "growth-boundary", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");

  // Already has 1 from bootstrap; create 3 more (total 4), then a 5th
  // should succeed, and a 6th should be blocked.
  for (let i = 0; i < 3; i++) {
    const r = await createExhibition(baseUrl, token, `Growth ${i}`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const fifth = await createExhibition(baseUrl, token, "Growth 5th");
  assert.equal(fifth.status, 201, JSON.stringify(fifth.body));

  const sixth = await createExhibition(baseUrl, token, "Growth 6th");
  assert.equal(sixth.status, 409, JSON.stringify(sixth.body));
  assert.equal(sixth.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(sixth.body.error.currentUsage, 5);
  assert.equal(sixth.body.error.limit, 5);

  const count = await prisma.exhibition.count({ where: { organizerId, status: { not: "completed" } } });
  assert.equal(count, 5);
});

// Test — completing an exhibition frees a Growth slot.
test("completing an exhibition frees its slot for a new one under Growth", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "growth-complete", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");
  for (let i = 0; i < 4; i++) {
    const r = await createExhibition(baseUrl, token, `Fill ${i}`);
    assert.equal(r.status, 201);
  }
  // Now at 5/5 — a 6th must be blocked.
  const blocked = await createExhibition(baseUrl, token, "Should be blocked");
  assert.equal(blocked.status, 409);

  await markExhibitionCompleted(firstExhibitionId);
  const allowed = await createExhibition(baseUrl, token, "Should now succeed");
  assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
});

// Test — Enterprise unlimited.
test("Enterprise never blocks on exhibition count", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "enterprise-unlimited", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "enterprise", "active");

  for (let i = 0; i < 8; i++) {
    const r = await createExhibition(baseUrl, token, `Enterprise ${i}`);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const count = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(count, 9); // 1 from bootstrap + 8
});

// Test — the /duplicate alternate path is also entitlement-checked.
test("duplicating an exhibition is also blocked once the plan's exhibition limit is reached", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "duplicate-path", ts);
  organizerIds.push(organizerId);
  // Still trialing Starter, 1 exhibition already used — duplicate must be blocked exactly like a normal create.
  const dup = await fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await dup.json();
  assert.equal(dup.status, 409, JSON.stringify(body));
  assert.equal(body.error.code, "PLAN_LIMIT_EXCEEDED");

  const count = await prisma.exhibition.count({ where: { organizerId } });
  assert.equal(count, 1, "the duplicate must not have created a second exhibition");
});

// Test — concurrency: two concurrent Growth exhibition creations at the 4/5 boundary.
test("concurrency: two simultaneous exhibition creations for the final Growth slot — exactly one succeeds", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "growth-race", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");
  // 1 from bootstrap + 3 more = 4/5, leaving exactly one slot.
  for (let i = 0; i < 3; i++) {
    const r = await createExhibition(baseUrl, token, `Prefill ${i}`);
    assert.equal(r.status, 201);
  }

  const [a, b] = await Promise.all([
    createExhibition(baseUrl, token, "Race A"),
    createExhibition(baseUrl, token, "Race B"),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected exactly one 201 and one 409, got ${JSON.stringify([a.status, b.status])}`);

  const count = await prisma.exhibition.count({ where: { organizerId, status: { not: "completed" } } });
  assert.equal(count, 5, "the database must contain exactly 5 non-completed exhibitions, never 6");
});
