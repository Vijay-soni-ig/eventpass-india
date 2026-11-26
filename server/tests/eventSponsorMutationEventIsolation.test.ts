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
  const email = `event-sponsor-lock-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `event-sponsor-lock-${label}-${ts}`,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Event Sponsor Lock ${label}`,
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
      title: `Event Sponsor Lock ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Sponsor Lock Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["SPONSORS"],
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json() as { event: { id: string } }).event.id;
}

async function createSponsor(eventId: string) {
  return prisma.eventParticipant.create({
    data: {
      eventId,
      participantType: "SPONSOR",
      name: "Protected Sponsor",
      organization: "Sponsor Lock Test",
      isPublic: true,
    },
  });
}

test("Event sponsor list waits for organizer membership revocation before returning data", async () => {
  const owner = await signup("revoked-read");
  const eventId = await createEvent(owner.token, "revoked-read");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const sponsor = await createSponsor(eventId);
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const held = await holdOrganizerMembershipChange(event.organizerId, membership.id, "revoke");
  const responsePromise = fetch(`${baseUrl}/api/events/${eventId}/sponsors`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404, "revoked organizer membership must not return Event sponsor data");
  assert.equal(
    await prisma.eventParticipant.count({ where: { id: sponsor.id, eventId, participantType: "SPONSOR" } }),
    1,
    "a denied read must not alter the sponsor record",
  );
});

test("Event sponsor mutation waits for organizer role downgrade and leaves the record unchanged", async () => {
  const owner = await signup("role-owner");
  const admin = await signup("role-admin");
  const eventId = await createEvent(owner.token, "role-downgrade");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const sponsor = await createSponsor(eventId);
  const membership = await prisma.organizerMembership.create({
    data: {
      organizerId: event.organizerId,
      userId: admin.userId,
      role: "admin",
      status: "active",
    },
  });

  const held = await holdOrganizerMembershipChange(event.organizerId, membership.id, "downgrade");
  const responsePromise = fetch(`${baseUrl}/api/events/${eventId}/sponsors/${sponsor.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.token}`,
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
  const unchanged = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: sponsor.id } });
  assert.equal(unchanged.name, "Protected Sponsor");
  assert.equal(unchanged.title, null, "denied mutation must not change sponsor data");
  assert.equal(unchanged.status, "ACTIVE");
  assert.equal(unchanged.archivedAt, null);
});
