import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
const testPassword = "TestPassword123!";

async function createUser(label: string) {
  const email = `member-view-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: testPassword, fullName: `Member View ${label}`, userType: "visitor" }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, `signup should succeed: ${JSON.stringify(body)}`);
  assert.ok(body.token);
  assert.ok(body.user?.id);
  return { email, token: body.token, userId: body.user.id };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

test("organizer member directory requires organizerMember:view permission", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, `member-view-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const scanner = await createUser("scanner");
  await prisma.organizerMembership.create({
    data: {
      organizerId: organizer.organizerId,
      userId: scanner.userId,
      invitedEmail: scanner.email,
      role: "scanner",
      status: "active",
    },
  });

  const ownerResponse = await fetch(`${baseUrl}/api/organizer-members/${organizer.organizerId}`, {
    headers: { Authorization: `Bearer ${organizer.token}` },
  });
  assert.equal(ownerResponse.status, 200, "organizer owner must be able to view team members");

  const scannerResponse = await fetch(`${baseUrl}/api/organizer-members/${organizer.organizerId}`, {
    headers: { Authorization: `Bearer ${scanner.token}` },
  });
  assert.equal(scannerResponse.status, 403, "scanner role must not view the organizer member directory");
});


test("organizer member directory denies access when caller membership is revoked before the locked read", async () => {
  const owner = await bootstrapOrganizer(baseUrl, `member-view-race-${ts}`, ts + 1);
  organizerIds.push(owner.organizerId);
  userIds.push(owner.userId);

  const ownerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: owner.organizerId, userId: owner.userId, role: "owner", status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      // Simulate revocation after the request starts but before the locked
      // authorization/member-directory transaction is entered.
      await prisma.organizerMembership.delete({ where: { id: ownerMembership.id } });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof prisma.$transaction;

    const response = await fetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /organizer not found/i);
  } finally {
    client.$transaction = originalTransaction;
    await prisma.organizerMembership.deleteMany({ where: { organizerId: owner.organizerId } });
  }
});
