import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const userIds: string[] = [];
const businessIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  if (businessIds.length > 0) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await stop();
  await prisma.$disconnect();
});

async function jsonRequest(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function createExhibitor(label: string) {
  const email = `a1-membership-${label}-${ts}@example.com`;
  const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `A1 Membership ${label}`,
      userType: "exhibitor",
    }),
  });
  const signup = await signupRes.json() as { token: string; user: { id: string } };
  assert.equal(signupRes.status, 201, JSON.stringify(signup));
  userIds.push(signup.user.id);
  return signup;
}

test("A1 organizer membership access rejects cross-organizer reads and mutations", async () => {
  const ownerA = await bootstrapOrganizer(baseUrl, "membership-owner-a", ts);
  const ownerB = await bootstrapOrganizer(baseUrl, "membership-owner-b", ts + 1);
  organizerIds.push(ownerA.organizerId, ownerB.organizerId);

  const target = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: ownerB.organizerId, userId: ownerB.userId },
  });
  const before = await prisma.organizerMembership.findUniqueOrThrow({ where: { id: target.id } });

  const list = await jsonRequest(`/api/organizer-members/${ownerB.organizerId}`, ownerA.token);
  assert.equal(list.status, 404);

  const patch = await jsonRequest(`/api/organizer-members/member/${target.id}`, ownerA.token, {
    method: "PATCH",
    body: JSON.stringify({ role: "scanner" }),
  });
  assert.equal(patch.status, 403);

  const remove = await jsonRequest(`/api/organizer-members/member/${target.id}`, ownerA.token, { method: "DELETE" });
  assert.equal(remove.status, 403);

  const after = await prisma.organizerMembership.findUniqueOrThrow({ where: { id: target.id } });
  assert.deepEqual(
    { role: after.role, status: after.status, organizerId: after.organizerId },
    { role: before.role, status: before.status, organizerId: before.organizerId },
  );
});

test("A1 exhibitor membership access rejects cross-business reads and mutations", async () => {
  const ownerA = await createExhibitor("owner-a");
  const ownerB = await createExhibitor("owner-b");

  const businessA = await prisma.exhibitorBusiness.create({
    data: { ownerId: ownerA.user.id, companyName: "A1 Business A" },
  });
  const businessB = await prisma.exhibitorBusiness.create({
    data: { ownerId: ownerB.user.id, companyName: "A1 Business B" },
  });
  businessIds.push(businessA.id, businessB.id);

  const target = await prisma.exhibitorMembership.create({
    data: { exhibitorBusinessId: businessB.id, userId: ownerB.user.id, role: "owner", status: "active" },
  });

  const list = await jsonRequest(`/api/exhibitor-members/${businessB.id}`, ownerA.token);
  assert.equal(list.status, 404);

  const patch = await jsonRequest(`/api/exhibitor-members/member/${target.id}`, ownerA.token, {
    method: "PATCH",
    body: JSON.stringify({ role: "staff" }),
  });
  assert.equal(patch.status, 403);

  const remove = await jsonRequest(`/api/exhibitor-members/member/${target.id}`, ownerA.token, { method: "DELETE" });
  assert.equal(remove.status, 403);

  const after = await prisma.exhibitorMembership.findUniqueOrThrow({ where: { id: target.id } });
  assert.equal(after.role, "owner");
  assert.equal(after.status, "active");
  assert.equal(after.exhibitorBusinessId, businessB.id);
});
