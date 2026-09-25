import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

async function signup(baseUrl: string, email: string) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "RBAC Security Test",
      userType: "visitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.token as string;
}

async function invite(baseUrl: string, token: string, organizerId: string, email: string, role: string) {
  const response = await fetch(`${baseUrl}/api/organizer-members/${organizerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ invitedEmail: email, role }),
  });
  return { status: response.status, body: await response.json() };
}

async function updateMember(baseUrl: string, token: string, memberId: string, patch: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/organizer-members/member/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  return { status: response.status, body: await response.json() };
}

async function deleteMember(baseUrl: string, token: string, memberId: string) {
  const response = await fetch(`${baseUrl}/api/organizer-members/member/${memberId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("RBAC: only an owner can create another owner membership", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "owner-rbac", ts);
  organizerIds.push(owner.organizerId);

  const adminEmail = `rbac-admin-${ts}@example.com`;
  const adminToken = await signup(baseUrl, adminEmail);
  const invited = await invite(baseUrl, owner.token, owner.organizerId, adminEmail, "admin");
  assert.equal(invited.status, 201, JSON.stringify(invited.body));

  const attempt = await invite(baseUrl, adminToken, owner.organizerId, `rbac-owner-${ts}@example.com`, "owner");
  assert.equal(attempt.status, 403, JSON.stringify(attempt.body));
});

test("RBAC: an admin cannot modify or remove an owner membership", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "owner-protection", ts);
  organizerIds.push(owner.organizerId);

  const adminEmail = `rbac-admin-2-${ts}@example.com`;
  const adminToken = await signup(baseUrl, adminEmail);
  await invite(baseUrl, owner.token, owner.organizerId, adminEmail, "admin");

  const ownerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: owner.organizerId, userId: owner.userId },
  });

  const demote = await updateMember(baseUrl, adminToken, ownerMembership.id, { role: "scanner" });
  assert.equal(demote.status, 409, JSON.stringify(demote.body));

  const remove = await deleteMember(baseUrl, adminToken, ownerMembership.id);
  assert.equal(remove.status, 409, JSON.stringify(remove.body));
});

test("RBAC: an organizer cannot remove the final active owner", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "last-owner", ts);
  organizerIds.push(owner.organizerId);

  const secondOwnerEmail = `rbac-second-owner-${ts}@example.com`;
  await signup(baseUrl, secondOwnerEmail);
  const invited = await invite(baseUrl, owner.token, owner.organizerId, secondOwnerEmail, "owner");
  assert.equal(invited.status, 201, JSON.stringify(invited.body));

  const memberships = await prisma.organizerMembership.findMany({
    where: { organizerId: owner.organizerId, role: "owner", status: "active" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(memberships.length, 2);

  const removeSecond = await deleteMember(baseUrl, owner.token, memberships[1].id);
  assert.equal(removeSecond.status, 204);

  const removeLast = await deleteMember(baseUrl, owner.token, memberships[0].id);
  assert.equal(removeLast.status, 409, JSON.stringify(removeLast.body));

  const stillOwner = await prisma.organizerMembership.findUnique({ where: { id: memberships[0].id } });
  assert.equal(stillOwner?.role, "owner");
  assert.equal(stillOwner?.status, "active");
});
