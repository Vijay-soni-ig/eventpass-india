import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// A1 (#926): field-level tenant isolation for PUT /api/organizer/profile. The
// organizer is resolved from the caller's membership, never the request, so
// these prove the write cannot reach another organizer, cannot be used to set
// server-controlled fields, and is denied to roles without
// organizerProfile:manage.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "profile-put-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "profile-put-b", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

const put = (token: string | null, body: unknown) =>
  fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

test("organizer B cannot take organizer A's slug, and neither organizer changes", async () => {
  const slugA = `profile-put-a-${ts}`;
  assert.equal((await put(orgA.token, { name: "Profile Put A", slug: slugA })).status, 200);
  const aBefore = await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } });
  const bBefore = await prisma.organizer.findUniqueOrThrow({ where: { id: orgB.organizerId } });

  const response = await put(orgB.token, { slug: slugA });
  assert.equal(response.status, 409, await response.clone().text());

  assert.deepEqual(await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } }), aBefore);
  assert.deepEqual(await prisma.organizer.findUniqueOrThrow({ where: { id: orgB.organizerId } }), bBefore);
});

test("PUT cannot be used to set server-controlled fields or to target another organizer", async () => {
  const aBefore = await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } });
  const bBefore = await prisma.organizer.findUniqueOrThrow({ where: { id: orgB.organizerId } });

  const response = await put(orgB.token, {
    name: "Profile Put B Renamed",
    // None of these are part of the profile contract; they must be ignored.
    id: orgA.organizerId,
    organizerId: orgA.organizerId,
    kycStatus: "verified",
    suspended: true,
    suspendedReason: "injected",
    slug: undefined,
  });
  assert.equal(response.status, 200, await response.clone().text());

  const aAfter = await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } });
  const bAfter = await prisma.organizer.findUniqueOrThrow({ where: { id: orgB.organizerId } });
  assert.deepEqual(aAfter, aBefore, "organizer A must be untouched by B's request");
  assert.equal(bAfter.id, bBefore.id);
  assert.equal(bAfter.name, "Profile Put B Renamed", "the allowed field is applied to the caller's own organizer");
  assert.equal(bAfter.kycStatus, bBefore.kycStatus, "kycStatus is server-controlled");
  assert.equal(bAfter.suspended, bBefore.suspended, "suspended is server-controlled");
  assert.equal(bAfter.suspendedReason, bBefore.suspendedReason);
});

test("a scanner-only member and a visitor cannot update the organizer profile; anonymous gets 401", async () => {
  const scanner = await signupUser(baseUrl, `profile-put-scanner-${ts}@example.com`, "Profile Put Scanner", "organizer");
  userIds.push(scanner.userId);
  await prisma.organizerMembership.create({
    data: { organizerId: orgA.organizerId, userId: scanner.userId, invitedEmail: `profile-put-scanner-${ts}@example.com`, role: "scanner", status: "active" },
  });
  // The signup also created an owner membership for the user's own organizer;
  // downgrade every membership so this account is genuinely scanner-only.
  await prisma.organizerMembership.updateMany({ where: { userId: scanner.userId }, data: { role: "scanner" } });
  const visitor = await signupUser(baseUrl, `profile-put-visitor-${ts}@example.com`, "Profile Put Visitor", "visitor");
  userIds.push(visitor.userId);

  const aBefore = await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } });
  assert.equal((await put(scanner.token, { name: "Scanner Overwrite" })).status, 403);
  assert.equal((await put(visitor.token, { name: "Visitor Overwrite" })).status, 403);
  assert.equal((await put(null, { name: "Anonymous Overwrite" })).status, 401);
  assert.deepEqual(await prisma.organizer.findUniqueOrThrow({ where: { id: orgA.organizerId } }), aBefore);
});
