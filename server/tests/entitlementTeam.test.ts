import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, inviteTeamMember, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

// Test — boundary + over-limit. Starter allows 3 team members. Bootstrap
// itself creates the owner (member #1), so 2 more invites should succeed
// and the 3rd invite (member #4) should be blocked.
test("Starter allows exactly 3 team members (including the owner), blocks the 4th", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "team-boundary", ts);
  organizerIds.push(organizerId);

  const second = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team2-${ts}@example.com`);
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const third = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team3-${ts}@example.com`);
  assert.equal(third.status, 201, JSON.stringify(third.body));

  const fourth = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team4-${ts}@example.com`);
  assert.equal(fourth.status, 409, JSON.stringify(fourth.body));
  assert.equal(fourth.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(fourth.body.error.resource, "team_member");
  assert.equal(fourth.body.error.currentUsage, 3);
  assert.equal(fourth.body.error.limit, 3);

  const count = await prisma.organizerMembership.count({ where: { organizerId } });
  assert.equal(count, 3, "the owner + 2 successful invites = 3, the blocked 4th must not exist");
});

// Test — counting rule: a pending ("invited", no linked user) invite counts
// exactly the same as an active one.
test("a pending (unaccepted) invitation counts toward the team limit exactly like an active member", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "team-pending-counts", ts);
  organizerIds.push(organizerId);

  // Invite an email with no existing User account -> status "invited".
  const pendingEmail = `phase20c-team-pending-${ts}@example.com`;
  const invite = await inviteTeamMember(baseUrl, token, organizerId, pendingEmail);
  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  assert.equal(invite.body.member.status, "invited");

  const third = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-active-${ts}@example.com`);
  assert.equal(third.status, 201, JSON.stringify(third.body));

  // Now at 3/3 (owner + pending invite + this one) — a 4th must be blocked,
  // proving the pending invite already consumed a slot.
  const fourth = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-blocked-${ts}@example.com`);
  assert.equal(fourth.status, 409, JSON.stringify(fourth.body));
});

// Test — removing a member frees a slot.
test("removing a team member frees a slot for a new invite", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "team-removal-frees-slot", ts);
  organizerIds.push(organizerId);

  const invite2 = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-r2-${ts}@example.com`);
  const invite3 = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-r3-${ts}@example.com`);
  assert.equal(invite2.status, 201);
  assert.equal(invite3.status, 201);

  const blocked = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-r4-${ts}@example.com`);
  assert.equal(blocked.status, 409);

  // Remove one, then a new invite should succeed.
  await fetch(`${baseUrl}/api/organizer-members/member/${invite2.body.member.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const allowed = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-r5-${ts}@example.com`);
  assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
});

// Test — RBAC: an unauthorized organizer role cannot invite team members at
// all (existing permission check), independent of entitlement.
test("a role without organizerMember:manage cannot invite team members regardless of entitlement headroom", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "team-rbac", ts);
  organizerIds.push(organizerId);

  // Invite a scanner-role member, log in as them, and confirm THEY cannot invite further members.
  const scannerEmail = `phase20c-team-scanner-${ts}@example.com`;
  const signupScanner = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: scannerEmail, password: "testpass123", fullName: "Phase20C Scanner", userType: "visitor" }),
  }).then((r) => r.json());
  const invite = await inviteTeamMember(baseUrl, token, organizerId, scannerEmail);
  assert.equal(invite.status, 201, JSON.stringify(invite.body));

  const attempted = await inviteTeamMember(baseUrl, signupScanner.token, organizerId, `phase20c-team-blocked-by-rbac-${ts}@example.com`);
  assert.equal(attempted.status, 403, JSON.stringify(attempted.body));
});

// Test — concurrency: final team slot race.
test("concurrency: two simultaneous invitations for the final team slot — exactly one succeeds", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "team-race", ts);
  organizerIds.push(organizerId);
  // 1 (owner) already used, 2 slots remain (limit 3) — invite one more to leave exactly 1 slot.
  const filler = await inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-race-filler-${ts}@example.com`);
  assert.equal(filler.status, 201);

  const [a, b] = await Promise.all([
    inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-race-a-${ts}@example.com`),
    inviteTeamMember(baseUrl, token, organizerId, `phase20c-team-race-b-${ts}@example.com`),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected exactly one invite to succeed: ${JSON.stringify([a.status, b.status])}`);

  const count = await prisma.organizerMembership.count({ where: { organizerId } });
  assert.equal(count, 3, "must never exceed the Starter limit of 3, even under concurrent invitation");
});
