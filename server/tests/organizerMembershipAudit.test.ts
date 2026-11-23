import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { hashInvitationToken } from "../src/lib/teamInvitations";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
const membershipIds: string[] = [];
const testPassword = "TestPassword123!";

async function createUser(label: string) {
  const email = `organizer-membership-audit-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `organizer-membership-audit-${label}-${ts}`,
    },
    body: JSON.stringify({ email, password: testPassword, fullName: `Organizer Membership Audit ${label}`, userType: "visitor" }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.ok(body.token);
  assert.ok(body.user?.id);
  userIds.push(body.user.id);
  return { email, token: body.token, userId: body.user.id };
}

function extractToken(html: string) {
  const link = html.match(/href="([^"]+)"/)?.[1];
  assert.ok(link, "invitation email must include a link");
  const redirect = new URL(link).searchParams.get("redirect");
  assert.ok(redirect, "invitation link must include redirect");
  const token = new URL(redirect, "http://localhost").searchParams.get("token");
  assert.ok(token, "invitation redirect must include token");
  return token;
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  const currentMemberships = organizerIds.length
    ? await prisma.organizerMembership.findMany({ where: { organizerId: { in: organizerIds } }, select: { id: true } })
    : [];
  const auditEntityIds = [...new Set([...membershipIds, ...currentMemberships.map((membership) => membership.id)])];
  if (auditEntityIds.length) {
    await prisma.auditLog.deleteMany({
      where: { entityType: "OrganizerMembership", entityId: { in: auditEntityIds } },
    });
  }
  await cleanupOrganizers(organizerIds);
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

test("organizer membership lifecycle audits invitations, acceptance, role changes, and removal without secrets", async () => {
  const owner = await bootstrapOrganizer(baseUrl, `membership-audit-${ts}`, ts);
  organizerIds.push(owner.organizerId);
  userIds.push(owner.userId);

  const firstRecipient = await createUser("role-change");
  const acceptedRecipient = await createUser("accept-revoke");
  const emailHtml: string[] = [];
  const originalFetch = globalThis.fetch;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "ExhibitTix Tests <tests@example.com>";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "https://api.resend.com/emails") return originalFetch(input, init);
    const payload = JSON.parse(String(init?.body)) as { html: string };
    emailHtml.push(payload.html);
    return new Response(JSON.stringify({ id: `organizer-membership-audit-${emailHtml.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const firstInviteResponse = await originalFetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ invitedEmail: firstRecipient.email, role: "scanner" }),
    });
    const firstInviteBody = await firstInviteResponse.json() as { member?: { id: string; role: string }; error?: string };
    assert.equal(firstInviteResponse.status, 201, JSON.stringify(firstInviteBody));
    assert.ok(firstInviteBody.member);
    const firstMembershipId = firstInviteBody.member.id;
    membershipIds.push(firstMembershipId);
    const firstToken = extractToken(emailHtml[0]);

    const roleResponse = await originalFetch(`${baseUrl}/api/organizer-members/member/${firstMembershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization": `Bearer ${owner.token}` },
      body: JSON.stringify({ role: "finance" }),
    });
    const roleBody = await roleResponse.json() as { member?: { role: string }; error?: string };
    assert.equal(roleResponse.status, 200, JSON.stringify(roleBody));
    assert.equal(roleBody.member?.role, "finance");

    const secondInviteResponse = await originalFetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ invitedEmail: acceptedRecipient.email, role: "scanner" }),
    });
    const secondInviteBody = await secondInviteResponse.json() as { member?: { id: string; role: string }; error?: string };
    assert.equal(secondInviteResponse.status, 201, JSON.stringify(secondInviteBody));
    assert.ok(secondInviteBody.member);
    const secondMembershipId = secondInviteBody.member.id;
    membershipIds.push(secondMembershipId);
    const secondToken = extractToken(emailHtml[1]);

    const acceptanceResponse = await originalFetch(`${baseUrl}/api/team-invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization": `Bearer ${acceptedRecipient.token}` },
      body: JSON.stringify({ token: secondToken }),
    });
    assert.equal(acceptanceResponse.status, 200, await acceptanceResponse.text());

    const removalResponse = await originalFetch(`${baseUrl}/api/organizer-members/member/${secondMembershipId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(removalResponse.status, 204);

    const events = await prisma.auditLog.findMany({
      where: { entityType: "OrganizerMembership", entityId: { in: membershipIds } },
      orderBy: { createdAt: "asc" },
      select: { action: true, entityId: true, actorUserId: true, metadata: true },
    });
    const invitations = events.filter((event) => event.action === "organizer_member.invitation_sent");
    assert.equal(invitations.length, 2);
    assert.deepEqual(new Set(invitations.map((event) => event.entityId)), new Set(membershipIds));
    for (const event of invitations) {
      const metadata = event.metadata as { invitedEmail?: string; role?: string };
      assert.equal(event.actorUserId, owner.userId);
      assert.equal(metadata.role, "scanner");
      assert.ok(metadata.invitedEmail);
    }

    const roleChange = events.find((event) => event.action === "organizer_member.role_changed");
    assert.ok(roleChange);
    assert.equal(roleChange.entityId, firstMembershipId);
    assert.equal(roleChange.actorUserId, owner.userId);
    const roleMetadata = roleChange.metadata as { previousRole?: string; newRole?: string };
    assert.equal(roleMetadata.previousRole, "scanner");
    assert.equal(roleMetadata.newRole, "finance");

    const accepted = events.find((event) => event.action === "organizer_member.invitation_accepted");
    assert.ok(accepted);
    assert.equal(accepted.entityId, secondMembershipId);
    assert.equal(accepted.actorUserId, acceptedRecipient.userId);
    const acceptedMetadata = accepted.metadata as { organizerId?: string; invitedEmail?: string; role?: string };
    assert.equal(acceptedMetadata.organizerId, owner.organizerId);
    assert.equal(acceptedMetadata.invitedEmail, acceptedRecipient.email);
    assert.equal(acceptedMetadata.role, "scanner");

    const revoked = events.find((event) => event.action === "organizer_member.revoked");
    assert.ok(revoked);
    assert.equal(revoked.entityId, secondMembershipId);
    assert.equal(revoked.actorUserId, owner.userId);
    const revokedMetadata = revoked.metadata as { userId?: string; previousRole?: string; previousStatus?: string };
    assert.equal(revokedMetadata.userId, acceptedRecipient.userId);
    assert.equal(revokedMetadata.previousRole, "scanner");
    assert.equal(revokedMetadata.previousStatus, "active");

    const serializedMetadata = JSON.stringify(events.map((event) => event.metadata));
    assert.doesNotMatch(serializedMetadata, /token|hash/i, "audit metadata must not contain token/hash fields");
    assert.doesNotMatch(serializedMetadata, new RegExp(firstToken));
    assert.doesNotMatch(serializedMetadata, new RegExp(secondToken));
    assert.doesNotMatch(serializedMetadata, new RegExp(hashInvitationToken(firstToken)));
    assert.doesNotMatch(serializedMetadata, new RegExp(hashInvitationToken(secondToken)));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  }
});
