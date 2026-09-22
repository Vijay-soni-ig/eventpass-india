import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupBusinessIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  if (cleanupBusinessIds.length > 0) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: cleanupBusinessIds } } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: cleanupBusinessIds } } });
  }
  if (cleanupUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
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

test("RBAC: suspended organizer cannot access organizer membership roster", async () => {
  const fixture = await bootstrapOrganizer(baseUrl, "suspended-member-access", ts);
  organizerIds.push(fixture.organizerId);

  await prisma.organizer.update({
    where: { id: fixture.organizerId },
    data: { suspended: true, suspendedAt: new Date(), suspendedReason: "RBAC test" },
  });

  const res = await jsonRequest(`/api/organizer-members/${fixture.organizerId}`, fixture.token);
  assert.equal(res.status, 404, JSON.stringify(await res.json()));
});

test("RBAC: suspended exhibitor business cannot access exhibitor membership roster", async () => {
  const email = `rbac-suspended-exhibitor-${ts}@example.com`;
  const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "RBAC Suspended Exhibitor",
      userType: "exhibitor",
    }),
  });
  const signup = await signupRes.json() as { token: string; user: { id: string } };
  assert.equal(signupRes.status, 201, JSON.stringify(signup));
  cleanupUserIds.push(signup.user.id);

  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: signup.user.id, companyName: "RBAC Suspended Business", suspended: true, suspendedAt: new Date(), suspendedReason: "RBAC test" },
  });
  cleanupBusinessIds.push(business.id);

  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      userId: signup.user.id,
      role: "owner",
      status: "active",
    },
  });

  const res = await jsonRequest(`/api/exhibitor-members/${business.id}`, signup.token);
  assert.equal(res.status, 404, JSON.stringify(await res.json()));
});
