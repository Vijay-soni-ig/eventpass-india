import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, inviteTeamMember, createStall, login, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

async function changePlanAsAdmin(organizerId: string, planId: string) {
  const adminToken = await login(baseUrl, "platform.admin@eventpass.test");
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription/plan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ planId }),
  });
  return { status: res.status, body: await res.json() };
}

// Test — downgrade with usage below the target plan's limit: unaffected.
test("downgrading Growth->Starter when usage is already within Starter's limits changes nothing about existing data or future writes", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "downgrade-below-limit", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");

  const invite2 = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-dg-below-2-${ts}@example.com`);
  assert.equal(invite2.status, 201); // 2 members total — well within Starter's 3

  const changed = await changePlanAsAdmin(organizerId, "plan-starter");
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.subscription.plan.code, "starter");

  const count = await prisma.organizerMembership.count({ where: { organizerId } });
  assert.equal(count, 2, "existing members must be untouched by the downgrade");

  // A further invite should still succeed (2/3 used, 1 left).
  const invite3 = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-dg-below-3-${ts}@example.com`);
  assert.equal(invite3.status, 201, JSON.stringify(invite3.body));
});

// Test — downgrade with usage ALREADY above the target plan's limit:
// existing data preserved, future writes blocked.
test("downgrading Growth->Starter when usage already exceeds Starter's limits preserves existing data but blocks further writes", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "downgrade-over-limit", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");

  // Add stalls well past Starter's 25-stall limit (Growth allows up to 150).
  for (let i = 0; i < 29; i++) {
    const r = await createStall(baseUrl, token, (await prisma.exhibition.findFirstOrThrow({ where: { organizerId } })).id);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const stallCountBefore = await prisma.stall.count({ where: { exhibition: { organizerId } } });
  assert.equal(stallCountBefore, 29, "sanity check: 29 stalls exist, already above Starter's 25 limit");

  const changed = await changePlanAsAdmin(organizerId, "plan-starter");
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  // Existing 29 stalls must remain exactly as they were — no deletion, no mutation.
  const stallCountAfter = await prisma.stall.count({ where: { exhibition: { organizerId } } });
  assert.equal(stallCountAfter, 29, "downgrading must never delete or hide existing over-limit data");

  // But a NEW stall creation must now be blocked (29 already >= Starter's 25).
  const exhibitionId = (await prisma.exhibition.findFirstOrThrow({ where: { organizerId } })).id;
  const blocked = await createStall(baseUrl, token, exhibitionId);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(blocked.body.error.currentUsage, 29);
  assert.equal(blocked.body.error.limit, 25);

  // Reads remain available regardless (the organizer can still see/manage their existing 29 stalls).
  const readBack = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(readBack.status, 200);
});

// Test — an over-limit organizer's admin-visible usage summary flags the over-limit state.
test("the platform admin usage summary shows an over-limit organizer's true usage after a downgrade", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "downgrade-admin-visibility", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");
  for (let i = 0; i < 4; i++) {
    await inviteTeamMember(baseUrl, token, organizerId, `phase20c-dg-vis-${i}-${ts}@example.com`);
  }
  await changePlanAsAdmin(organizerId, "plan-starter");

  const adminToken = await login(baseUrl, "platform.admin@eventpass.test");
  const res = await fetch(`${baseUrl}/api/platform/organizers/${organizerId}/subscription`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const body = await res.json();
  assert.equal(res.status, 200);
  const teamUsage = body.usage.find((u: { resource: string }) => u.resource === "team_member");
  assert.equal(teamUsage.currentUsage, 5, "owner + 4 invites");
  assert.equal(teamUsage.limit, 3, "now reflects the downgraded Starter limit");
  assert.ok(teamUsage.currentUsage > teamUsage.limit, "admin view must make the over-limit state visible (5 > 3)");
});
