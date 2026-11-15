import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const userIds: string[] = [];
let businessId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (businessId) {
    const memberships = await prisma.exhibitorMembership.findMany({
      where: { exhibitorBusinessId: businessId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "ExhibitorMembership",
        entityId: { in: memberships.map((membership) => membership.id) },
      },
    });
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: businessId } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: businessId } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await stop();
  await prisma.$disconnect();
});

async function createUser(label: string) {
  const email = `exhibitor-membership-audit-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `exhibitor-membership-audit-${label}-${ts}`,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Membership Audit ${label}`,
      userType: "visitor",
    }),
  });
  const payload = await response.json() as { token: string; user: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.ok(payload.token);
  userIds.push(payload.user.id);
  return { email, token: payload.token, userId: payload.user.id };
}

test("exhibitor membership lifecycle writes audit events for invite, role change, acceptance and revocation", async () => {
  const owner = await createUser("owner");
  const recipient = await createUser("recipient");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: owner.userId, companyName: `Membership Audit Business ${ts}` },
    select: { id: true },
  });
  businessId = business.id;
  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      userId: owner.userId,
      invitedEmail: owner.email,
      role: "owner",
      status: "active",
    },
  });

  const originalFetch = globalThis.fetch;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "ExhibitTix Tests <tests@example.com>";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "https://api.resend.com/emails") return originalFetch(input, init);
    return new Response(JSON.stringify({ id: "membership-audit-test" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const inviteResponse = await originalFetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ invitedEmail: recipient.email, role: "staff" }),
    });
    assert.equal(inviteResponse.status, 201, await inviteResponse.text());
    const inviteBody = await inviteResponse.json() as { member: { id: string; role: string } };
    const membershipId = inviteBody.member.id;
    assert.equal(inviteBody.member.role, "staff");

    const roleResponse = await originalFetch(`${baseUrl}/api/exhibitor-members/member/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(roleResponse.status, 200, await roleResponse.text());

    const acceptResponse = await originalFetch(`${baseUrl}/api/team-invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${recipient.token}` },
      body: JSON.stringify({ token: "not-the-token" }),
    });
    assert.equal(acceptResponse.status, 400, "invalid tokens must not create acceptance audit events");

    // Create a real invitation token by reading the delivery link from a second
    // invitation email. The endpoint intentionally returns no raw token.
    let invitationHtml = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== "https://api.resend.com/emails") return originalFetch(input, init);
      const payload = JSON.parse(String(init?.body)) as { html: string };
      invitationHtml = payload.html;
      return new Response(JSON.stringify({ id: "membership-audit-accept-test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const acceptInviteResponse = await originalFetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ invitedEmail: recipient.email, role: "staff" }),
    });
    assert.equal(acceptInviteResponse.status, 409, "duplicate active/pending invite must be rejected");
    assert.ok(!invitationHtml, "duplicate invitation must not send email");

    // The test retrieves the one-time link from a fresh invitation for a second
    // recipient so the acceptance path is verified without exposing token data.
    const secondRecipient = await createUser("second-recipient");
    const secondInviteResponse = await originalFetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ invitedEmail: secondRecipient.email, role: "staff" }),
    });
    assert.equal(secondInviteResponse.status, 201, await secondInviteResponse.text());
    const secondInvite = await secondInviteResponse.json() as { member: { id: string } };
    const link = invitationHtml.match(/href="([^"]+)"/)?.[1];
    assert.ok(link, "invitation email must include acceptance link");
    const redirect = new URL(link).searchParams.get("redirect");
    assert.ok(redirect);
    const token = new URL(redirect, "http://localhost").searchParams.get("token");
    assert.ok(token);

    const secondAccept = await originalFetch(`${baseUrl}/api/team-invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secondRecipient.token}` },
      body: JSON.stringify({ token }),
    });
    assert.equal(secondAccept.status, 200, await secondAccept.text());

    const revokeResponse = await originalFetch(`${baseUrl}/api/exhibitor-members/member/${secondInvite.member.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(revokeResponse.status, 204);

    const events = await prisma.auditLog.findMany({
      where: { entityType: "ExhibitorMembership", entityId: { in: [membershipId, secondInvite.member.id] } },
      orderBy: { createdAt: "asc" },
      select: { action: true, entityId: true, actorUserId: true, metadata: true },
    });
    const actions = events.map((event) => event.action);
    assert.ok(actions.includes("exhibitor_member.invitation_sent"));
    assert.ok(actions.includes("exhibitor_member.role_changed"));
    assert.ok(actions.includes("exhibitor_member.invitation_accepted"));
    assert.ok(actions.includes("exhibitor_member.revoked"));
    const roleChange = events.find((event) => event.action === "exhibitor_member.role_changed");
    assert.equal((roleChange?.metadata as { previousRole?: string }).previousRole, "staff");
    assert.equal((roleChange?.metadata as { newRole?: string }).newRole, "admin");
    const accepted = events.find((event) => event.action === "exhibitor_member.invitation_accepted");
    assert.equal(accepted?.actorUserId, secondRecipient.userId);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  }
});
