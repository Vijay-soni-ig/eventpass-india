import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { holdOrganizerMembershipChange, waitForBlockedOrganizerAccess } from "./helpers/organizerLockRace";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const email = "event-staff-lock-" + label + "-" + ts + "@example.com";
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "event-staff-lock-" + label + "-" + ts,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Event Staff Lock " + label,
      userType: "organizer",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { token: string };
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  return { token: body.token, userId: user.id };
}

async function createEvent(token: string, label: string) {
  const response = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "Event Staff Lock " + label + " " + ts,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Staff Lock Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json() as { event: { id: string } }).event.id;
}

async function createStaff(eventId: string) {
  return prisma.eventParticipant.create({
    data: {
      eventId,
      participantType: "STAFF",
      name: "Protected Staff Member",
      organization: "Staff Lock Test",
      isPublic: false,
    },
  });
}

test("Event staff list waits for organizer membership revocation before returning data", async () => {
  const owner = await signup("revoked-read");
  const eventId = await createEvent(owner.token, "revoked-read");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const staff = await createStaff(eventId);
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const held = await holdOrganizerMembershipChange(event.organizerId, membership.id, "revoke");
  const responsePromise = fetch(baseUrl + "/api/events/" + eventId + "/staff", {
    headers: { Authorization: "Bearer " + owner.token },
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404, "revoked organizer membership must not return Event staff data");
  assert.equal(
    await prisma.eventParticipant.count({ where: { id: staff.id, eventId, participantType: "STAFF" } }),
    1,
    "a denied read must not alter the staff record",
  );
});

test("Event staff mutation waits for organizer role downgrade and leaves the record unchanged", async () => {
  const owner = await signup("role-owner");
  const admin = await signup("role-admin");
  const eventId = await createEvent(owner.token, "role-downgrade");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const staff = await createStaff(eventId);
  const membership = await prisma.organizerMembership.create({
    data: {
      organizerId: event.organizerId,
      userId: admin.userId,
      role: "admin",
      status: "active",
    },
  });

  const held = await holdOrganizerMembershipChange(event.organizerId, membership.id, "downgrade");
  const responsePromise = fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staff.id, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + admin.token,
    },
    body: JSON.stringify({ title: "Unauthorized overwrite" }),
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404, "a member downgraded to marketing must lose event:update access");
  const unchanged = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: staff.id } });
  assert.equal(unchanged.name, "Protected Staff Member");
  assert.equal(unchanged.title, null, "denied mutation must not change staff data");
  assert.equal(unchanged.status, "ACTIVE");
  assert.equal(unchanged.archivedAt, null);
});
