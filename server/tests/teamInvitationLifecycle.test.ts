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

test("concurrent organizer invitations for the same email are serialized", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "duplicate-invite", ts + 1);
  organizerIds.push(owner.organizerId);
  const email = `duplicate-invite-${ts}@example.com`;
  const body = JSON.stringify({ invitedEmail: email, role: "scanner" });
  const send = () => fetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body,
  });
  const responses = await Promise.all([send(), send()]);
  assert.deepEqual(responses.map((r) => r.status).sort((a, b) => a - b), [201, 409]);
  assert.equal(await prisma.organizerMembership.count({
    where: { organizerId: owner.organizerId, invitedEmail: email, status: { in: ["active", "invited"] } },
  }), 1);
});
test("concurrent exhibitor invitations for the same email are serialized", async () => {
  const owner = await createUser("duplicate-exhibitor-owner");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: owner.user.id, companyName: `Duplicate Invitation Business ${ts}` },
    select: { id: true },
  });
  exhibitorBusinessIds.push(business.id);
  await prisma.exhibitorMembership.create({
    data: { exhibitorBusinessId: business.id, userId: owner.user.id, invitedEmail: owner.email, role: "owner", status: "active" },
  });
  const email = `duplicate-exhibitor-invite-${ts}@example.com`;
  const body = JSON.stringify({ invitedEmail: email, role: "staff" });
  const send = () => fetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body,
  });
  const responses = await Promise.all([send(), send()]);
  assert.deepEqual(responses.map((r) => r.status).sort((a, b) => a - b), [201, 409]);
  assert.equal(await prisma.exhibitorMembership.count({
    where: { exhibitorBusinessId: business.id, invitedEmail: email, status: { in: ["active", "invited"] } },
  }), 1);
});
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

test("suspended organizers and exhibitor businesses cannot activate team invitations", async () => {
  const organizerOwner = await bootstrapOrganizer(baseUrl, "suspended-invite", ts + 2);
  organizerIds.push(organizerOwner.organizerId);
  const organizerRecipient = await createUser("suspended-organizer-recipient");
  const organizerInvite = await createPendingInvitation(organizerOwner.organizerId, organizerRecipient.email);

  await prisma.organizer.update({
    where: { id: organizerOwner.organizerId },
    data: { suspended: true },
  });
  const blockedOrganizerAcceptance = await accept(organizerInvite.token, organizerRecipient.token);
  assert.equal(blockedOrganizerAcceptance.status, 400);
  const pendingOrganizerMembership = await prisma.organizerMembership.findUniqueOrThrow({
    where: { id: organizerInvite.member.id },
  });
  assert.equal(pendingOrganizerMembership.status, "invited");
  assert.equal(pendingOrganizerMembership.userId, null);

  await prisma.organizer.update({
    where: { id: organizerOwner.organizerId },
    data: { suspended: false },
  });
  const allowedOrganizerAcceptance = await accept(organizerInvite.token, organizerRecipient.token);
  assert.equal(allowedOrganizerAcceptance.status, 200, await allowedOrganizerAcceptance.text());

  const exhibitorOwner = await createUser("suspended-exhibitor-owner");
  const exhibitorRecipient = await createUser("suspended-exhibitor-recipient");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: exhibitorOwner.user.id, companyName: `Suspended Invitation Business ${ts}` },
    select: { id: true },
  });
  exhibitorBusinessIds.push(business.id);
  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      userId: exhibitorOwner.user.id,
      invitedEmail: exhibitorOwner.email,
      role: "owner",
      status: "active",
    },
  });
  const exhibitorToken = createInvitationToken();
  const exhibitorInvite = await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      invitedEmail: exhibitorRecipient.email,
      userId: null,
      role: "staff",
      status: "invited",
      invitationTokenHash: hashInvitationToken(exhibitorToken),
      invitationExpiresAt: invitationExpiresAt(),
    },
  });

  await prisma.exhibitorBusiness.update({
    where: { id: business.id },
    data: { suspended: true },
  });
  const blockedExhibitorAcceptance = await accept(exhibitorToken, exhibitorRecipient.token);
  assert.equal(blockedExhibitorAcceptance.status, 400);
  const pendingExhibitorMembership = await prisma.exhibitorMembership.findUniqueOrThrow({
    where: { id: exhibitorInvite.id },
  });
  assert.equal(pendingExhibitorMembership.status, "invited");
  assert.equal(pendingExhibitorMembership.userId, null);

  await prisma.exhibitorBusiness.update({
    where: { id: business.id },
    data: { suspended: false },
  });
  const allowedExhibitorAcceptance = await accept(exhibitorToken, exhibitorRecipient.token);
  assert.equal(allowedExhibitorAcceptance.status, 200, await allowedExhibitorAcceptance.text());
});

