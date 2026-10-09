import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const testPassword = "TestPassword123!";
let businessId: string | undefined;
const userIds: string[] = [];

async function createUser(label: string) {
  const email = `exhibitor-member-view-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: testPassword, fullName: `Exhibitor Member View ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, `signup should succeed: ${JSON.stringify(body)}`);
  assert.ok(body.token);
  assert.ok(body.user?.id);
  userIds.push(body.user.id);
  return { email, token: body.token, userId: body.user.id };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (businessId) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: businessId } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: businessId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

test("exhibitor member directory requires exhibitorMember:view permission", async () => {
  const owner = await createUser("owner");
  const staff = await createUser("staff");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: owner.userId, companyName: `Member View Business ${ts}` },
    select: { id: true },
  });
  businessId = business.id;
  await prisma.exhibitorMembership.createMany({
    data: [
      { exhibitorBusinessId: business.id, userId: owner.userId, invitedEmail: owner.email, role: "owner", status: "active" },
      { exhibitorBusinessId: business.id, userId: staff.userId, invitedEmail: staff.email, role: "staff", status: "active" },
    ],
  });

  const ownerResponse = await fetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(ownerResponse.status, 200, "exhibitor owner must be able to view team members");

  const staffResponse = await fetch(`${baseUrl}/api/exhibitor-members/${business.id}`, {
    headers: { Authorization: `Bearer ${staff.token}` },
  });
  assert.equal(staffResponse.status, 403, "exhibitor staff must not view the member directory");
});
