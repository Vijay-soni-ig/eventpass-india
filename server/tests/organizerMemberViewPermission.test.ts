import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
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
