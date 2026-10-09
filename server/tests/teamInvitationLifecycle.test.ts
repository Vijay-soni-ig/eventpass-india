import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { createInvitationToken, hashInvitationToken, invitationExpiresAt } from "../src/lib/teamInvitations";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const userIds: string[] = [];
const exhibitorBusinessIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  if (exhibitorBusinessIds.length) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: exhibitorBusinessIds } } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: exhibitorBusinessIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await stop();
  await prisma.$disconnect();
});

async function createUser(label: string) {
  const email = `team-invitation-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Team Invitation ${label}`,
      userType: "visitor",
    }),
  });
  const payload = await response.json() as { token: string; user: { id: string; email: string } };
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.ok(payload.token);
  userIds.push(payload.user.id);
  return { ...payload, email };
}

async function createPendingInvitation(organizerId: string, invitedEmail: string, expiresAt = invitationExpiresAt()) {
  const token = createInvitationToken();
  const member = await prisma.organizerMembership.create({
    data: {
      organizerId,
      invitedEmail,
      userId: null,
      role: "scanner",
      status: "invited",
      invitationTokenHash: hashInvitationToken(token),
      invitationExpiresAt: expiresAt,
    },
  });
  return { token, member };
}

async function accept(token: string, authToken: string) {
  return fetch(`${baseUrl}/api/team-invitations/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ token }),
  });
}

test("team invitation tokens enforce email binding, expiry, and single-use consumption", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "invitation-lifecycle", ts);
  organizerIds.push(owner.organizerId);

  // Concurrent attempts must not both consume the same invitation.
  const recipient = await createUser("concurrent-recipient");
  const concurrentInvite = await createPendingInvitation(owner.organizerId, recipient.email);
  const concurrentResponses = await Promise.all([
    accept(concurrentInvite.token, recipient.token),
    accept(concurrentInvite.token, recipient.token),
  ]);
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort((a, b) => a - b),
    [200, 400],
    "exactly one concurrent request should consume a single-use invitation",
  );
  const consumed = await prisma.organizerMembership.findUniqueOrThrow({ where: { id: concurrentInvite.member.id } });
  assert.equal(consumed.status, "active");
  assert.equal(consumed.userId, recipient.user.id);
  assert.equal(consumed.invitationTokenHash, null);
  assert.ok(consumed.invitationAcceptedAt);

  // A different account cannot accept the invitation, but the intended email can.
  const intended = await createUser("email-bound-recipient");
  const other = await createUser("wrong-email-recipient");
  const emailInvite = await createPendingInvitation(owner.organizerId, intended.email);
  const wrongEmailResponse = await accept(emailInvite.token, other.token);
  assert.equal(wrongEmailResponse.status, 400);
  const stillPending = await prisma.organizerMembership.findUniqueOrThrow({ where: { id: emailInvite.member.id } });
  assert.equal(stillPending.status, "invited");
  const intendedResponse = await accept(emailInvite.token, intended.token);
  assert.equal(intendedResponse.status, 200, await intendedResponse.text());

  // Expired invitations are rejected by both the preview and acceptance APIs.
  const expiredRecipient = await createUser("expired-recipient");
  const expiredInvite = await createPendingInvitation(
    owner.organizerId,
    expiredRecipient.email,
    new Date(Date.now() - 60_000),
  );
  const preview = await fetch(`${baseUrl}/api/team-invitations/${expiredInvite.token}`);
  assert.equal(preview.status, 410);
  const expiredAcceptance = await accept(expiredInvite.token, expiredRecipient.token);
  assert.equal(expiredAcceptance.status, 400);
  const expiredMembership = await prisma.organizerMembership.findUniqueOrThrow({ where: { id: expiredInvite.member.id } });
  assert.equal(expiredMembership.status, "invited");
  assert.equal(expiredMembership.userId, null);
});
