import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// UI-02B — the public Exhibition Detail page's Follow button (and the
// GET /api/organizers/:organizerId/follow-state it depends on) was reported
// 404ing for the seeded exhibition. The audit found the frontend/backend
// identifier contract was already consistent (organizer ID throughout) —
// the real cause was the organizer's `publicProfileEnabled` flag (which
// these routes correctly gate on) defaulting to false and never being set
// in seed data. These tests cover the actual contract these routes
// implement, including that exact gate, which had no prior dedicated
// coverage (only a single happy-path assertion existed, in
// phase22dDiscovery.test.ts).

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];

let orgPublic: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgPrivate: Awaited<ReturnType<typeof bootstrapOrganizer>>; // publicProfileEnabled left at its default (false)

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgPublic = await bootstrapOrganizer(baseUrl, "follow-pub", ts);
  orgPrivate = await bootstrapOrganizer(baseUrl, "follow-priv", ts);
  organizerIds.push(orgPublic.organizerId, orgPrivate.organizerId);

  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgPublic.token}` },
    body: JSON.stringify({ publicProfileEnabled: true, slug: `follow-org-pub-${ts}` }),
  });
  // orgPrivate: publicProfileEnabled intentionally left false (default) —
  // this is the exact real-world shape the reported bug reproduced against.
});

after(async () => {
  await prisma.organizerFollow.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
});

test("initial follow-state for a public organizer is 'not following' with a real follower count", async () => {
  const visitor = await signupUser(baseUrl, `ui02b-initial-${ts}@example.com`, "Initial Visitor", "visitor");
  userIds.push(visitor.userId);

  const res = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow-state`, {
    headers: { Authorization: `Bearer ${visitor.token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.following, false);
  assert.equal(typeof body.followerCount, "number");
});

test("unauthenticated requests to follow-state/follow/unfollow are rejected", async () => {
  const stateRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow-state`);
  assert.equal(stateRes.status, 401);

  const followRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "POST" });
  assert.equal(followRes.status, 401);

  const unfollowRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "DELETE" });
  assert.equal(unfollowRes.status, 401);
});

test("follow creates a real OrganizerFollow row, persists across a fresh follow-state request, and unfollow removes it", async () => {
  const visitor = await signupUser(baseUrl, `ui02b-followflow-${ts}@example.com`, "Follow Flow Visitor", "visitor");
  userIds.push(visitor.userId);
  const auth = { Authorization: `Bearer ${visitor.token}` };

  const followRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "POST", headers: auth });
  assert.equal(followRes.status, 200);
  const followBody = await followRes.json();
  assert.equal(followBody.following, true);

  const dbRowAfterFollow = await prisma.organizerFollow.findUnique({
    where: { organizerId_userId: { organizerId: orgPublic.organizerId, userId: visitor.userId } },
  });
  assert.ok(dbRowAfterFollow, "OrganizerFollow row must exist after follow");

  // Case D — refresh: a fresh GET (not the mutation's own response) must
  // reflect the persisted state.
  const refetchRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow-state`, { headers: auth });
  assert.equal((await refetchRes.json()).following, true);

  const unfollowRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "DELETE", headers: auth });
  assert.equal(unfollowRes.status, 200);
  assert.equal((await unfollowRes.json()).following, false);

  const dbRowAfterUnfollow = await prisma.organizerFollow.findUnique({
    where: { organizerId_userId: { organizerId: orgPublic.organizerId, userId: visitor.userId } },
  });
  assert.equal(dbRowAfterUnfollow, null, "OrganizerFollow row must be removed after unfollow");

  const refetchAfterUnfollowRes = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow-state`, { headers: auth });
  assert.equal((await refetchAfterUnfollowRes.json()).following, false);
});

test("duplicate follow requests are idempotent — exactly one OrganizerFollow row, no error", async () => {
  const visitor = await signupUser(baseUrl, `ui02b-dup-${ts}@example.com`, "Duplicate Follow Visitor", "visitor");
  userIds.push(visitor.userId);
  const auth = { Authorization: `Bearer ${visitor.token}` };

  const [first, second] = await Promise.all([
    fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "POST", headers: auth }),
    fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, { method: "POST", headers: auth }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const count = await prisma.organizerFollow.count({ where: { organizerId: orgPublic.organizerId, userId: visitor.userId } });
  assert.equal(count, 1, "concurrent duplicate follow requests must not create more than one row");
});

test("an organizer without a public profile enabled correctly 404s on follow-state/follow (the exact shape of the reported bug)", async () => {
  const visitor = await signupUser(baseUrl, `ui02b-private-${ts}@example.com`, "Private Org Visitor", "visitor");
  userIds.push(visitor.userId);
  const auth = { Authorization: `Bearer ${visitor.token}` };

  const stateRes = await fetch(`${baseUrl}/api/organizers/${orgPrivate.organizerId}/follow-state`, { headers: auth });
  assert.equal(stateRes.status, 404);

  const followRes = await fetch(`${baseUrl}/api/organizers/${orgPrivate.organizerId}/follow`, { method: "POST", headers: auth });
  assert.equal(followRes.status, 404);

  const followCount = await prisma.organizerFollow.count({ where: { organizerId: orgPrivate.organizerId } });
  assert.equal(followCount, 0, "a 404'd follow attempt must never create a row");
});

test("a genuinely nonexistent organizer id 404s without leaking whether it ever existed", async () => {
  const visitor = await signupUser(baseUrl, `ui02b-invalid-${ts}@example.com`, "Invalid Org Visitor", "visitor");
  userIds.push(visitor.userId);
  const auth = { Authorization: `Bearer ${visitor.token}` };

  const res = await fetch(`${baseUrl}/api/organizers/does-not-exist/follow-state`, { headers: auth });
  assert.equal(res.status, 404);
});

test("one visitor's follow never affects another visitor's own follow-state for the same organizer", async () => {
  const visitorA = await signupUser(baseUrl, `ui02b-crossuser-a-${ts}@example.com`, "Cross User A", "visitor");
  const visitorB = await signupUser(baseUrl, `ui02b-crossuser-b-${ts}@example.com`, "Cross User B", "visitor");
  userIds.push(visitorA.userId, visitorB.userId);

  await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${visitorA.token}` },
  });

  const stateForB = await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow-state`, {
    headers: { Authorization: `Bearer ${visitorB.token}` },
  });
  assert.equal((await stateForB.json()).following, false, "visitor B must not see visitor A's follow as their own");

  // Cleanup this test's own follow row so it doesn't leak into the
  // followerCount other tests in this file observe.
  await fetch(`${baseUrl}/api/organizers/${orgPublic.organizerId}/follow`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${visitorA.token}` },
  });
});
