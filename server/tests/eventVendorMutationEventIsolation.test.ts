import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { holdOrganizerMembershipChange, waitForBlockedOrganizerAccess } from "./helpers/organizerLockRace";

// A1 (#926): Event vendor routes must serialize with organizer membership
// changes exactly like partners, speakers, sponsors and staff. Each test holds
// the organizer row lock with a pending revoke/downgrade, fires a request that
// was authorized before the change, and proves the request is blocked on the
// lock and then denied once the change commits.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
  await prisma.$disconnect();
});

async function signup(label: string) {
  const email = `event-vendor-lock-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `event-vendor-lock-${label}-${ts}`,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Event Vendor Lock ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { token: string };
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  return { token: body.token, userId: user.id };
}

async function createEvent(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Event Vendor Lock ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Vendor Lock Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["VENDORS"],
    }),
  });
  assert.equal(response.status, 201);
  const eventId = (await response.json() as { event: { id: string } }).event.id;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  return { eventId, organizerId: event.organizerId };
}

async function createVendor(eventId: string, name: string) {
  return prisma.eventParticipant.create({
    data: { eventId, participantType: "VENDOR", name, organization: "Vendor Lock Test", isPublic: true },
  });
}

async function addAdmin(organizerId: string, userId: string) {
  return prisma.organizerMembership.create({ data: { organizerId, userId, role: "admin", status: "active" } });
}

// Fire `request` while a membership change holds the organizer lock; assert the
// request really blocked on that lock, then release and return its response.
async function raceAgainstMembershipChange(
  organizerId: string,
  membershipId: string,
  change: "revoke" | "downgrade",
  request: () => Promise<Response>,
) {
  const held = await holdOrganizerMembershipChange(organizerId, membershipId, change);
  const responsePromise = request();
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }
  return responsePromise;
}

test("Event vendor list waits for organizer membership revocation before returning private data", async () => {
  const owner = await signup("revoked-read");
  const { eventId, organizerId } = await createEvent(owner.token, "revoked-read");
  const vendor = await createVendor(eventId, "Revoked Vendor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId, userId: owner.userId, status: "active" },
  });

  const response = await raceAgainstMembershipChange(organizerId, membership.id, "revoke", () =>
    fetch(`${baseUrl}/api/events/${eventId}/vendors`, { headers: { Authorization: `Bearer ${owner.token}` } }),
  );

  assert.equal(response.status, 404, "revoked organizer membership must not return Event vendor data");
  assert.equal((await response.json() as { error?: string }).error, "Event not found");
  assert.equal(await prisma.eventParticipant.count({ where: { id: vendor.id, participantType: "VENDOR" } }), 1);
});

test("Event vendor update waits for organizer role downgrade and leaves the record unchanged", async () => {
  const owner = await signup("role-owner");
  const admin = await signup("role-admin");
  const { eventId, organizerId } = await createEvent(owner.token, "role-downgrade");
  const vendor = await createVendor(eventId, "Protected Vendor");
  const membership = await addAdmin(organizerId, admin.userId);

  const response = await raceAgainstMembershipChange(organizerId, membership.id, "downgrade", () =>
    fetch(`${baseUrl}/api/events/${eventId}/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ name: "Unauthorized overwrite" }),
    }),
  );

  assert.equal(response.status, 404, "a member downgraded to marketing must lose event:update access");
  const unchanged = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: vendor.id } });
  assert.equal(unchanged.name, "Protected Vendor");
  assert.equal(unchanged.status, "ACTIVE");
  assert.equal(unchanged.archivedAt, null);
});

test("Event vendor create waits for organizer membership revocation and creates nothing", async () => {
  const owner = await signup("create-owner");
  const admin = await signup("create-admin");
  const { eventId, organizerId } = await createEvent(owner.token, "create-revoked");
  const membership = await addAdmin(organizerId, admin.userId);

  const response = await raceAgainstMembershipChange(organizerId, membership.id, "revoke", () =>
    fetch(`${baseUrl}/api/events/${eventId}/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ name: "Unauthorized vendor" }),
    }),
  );

  assert.equal(response.status, 404, "a revoked member must not be able to create a vendor");
  assert.equal(await prisma.eventParticipant.count({ where: { eventId, participantType: "VENDOR" } }), 0);
});

test("Event vendor archive waits for organizer role downgrade and does not archive", async () => {
  const owner = await signup("archive-owner");
  const admin = await signup("archive-admin");
  const { eventId, organizerId } = await createEvent(owner.token, "archive-downgrade");
  const vendor = await createVendor(eventId, "Archive Target");
  const membership = await addAdmin(organizerId, admin.userId);

  const response = await raceAgainstMembershipChange(organizerId, membership.id, "downgrade", () =>
    fetch(`${baseUrl}/api/events/${eventId}/vendors/${vendor.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${admin.token}` },
    }),
  );

  assert.equal(response.status, 404, "a downgraded member must not be able to archive a vendor");
  const unchanged = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: vendor.id } });
  assert.equal(unchanged.status, "ACTIVE");
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.isPublic, true);
});
