import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { holdOrganizerMembershipChange, waitForBlockedOrganizerAccess } from "./helpers/organizerLockRace";

// A1 (#926): Event-scoped organizer routes (partner/sponsor/staff/vendor profiles, vendor services, sessions, sponsor packages, participants, contacts, activity
// profiles and vendor services) must serialize with organizer membership
// changes. Each case holds the organizer row lock with a pending revoke or role
// downgrade, fires a request that was authorized before the change, proves the
// request blocks on that lock, and checks it is denied once the change commits
// with nothing written.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
let counter = 0;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
  await prisma.$disconnect();
});

async function signup(label: string) {
  const email = `spec-lock-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `spec-lock-${label}-${ts}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Spec Lock ${label}`, userType: "organizer" }),
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
      title: `Spec Lock ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Spec Lock Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTNERS", "SPONSORS", "PARTICIPANTS", "VENDORS", "SESSIONS"],
    }),
  });
  assert.equal(response.status, 201);
  const eventId = (await response.json() as { event: { id: string } }).event.id;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  return { eventId, organizerId: event.organizerId };
}

type Fixture = { eventId: string; participantId: string };
type Case = {
  name: string;
  change: "revoke" | "downgrade";
  participantType?: "PARTNER" | "SPONSOR" | "STAFF" | "VENDOR";
  /** Optional extra fixture work, run before the lock is held. */
  setup?: (ctx: { eventId: string; ownerToken: string }) => Promise<void>;
  request: (f: Fixture) => { path: string; method: string; body?: unknown };
  assertUntouched: (f: Fixture) => Promise<void>;
};

const cases: Case[] = [
  {
    name: "partner profile PUT",
    change: "downgrade",
    participantType: "PARTNER",
    request: (f) => ({ path: `/api/events/${f.eventId}/partners/${f.participantId}/profile`, method: "PUT", body: { displayLabel: "Unauthorized" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventPartnerProfile.count({ where: { participantId: f.participantId } }), 0),
  },
  {
    name: "sponsor profile PUT",
    change: "revoke",
    participantType: "SPONSOR",
    request: (f) => ({ path: `/api/events/${f.eventId}/sponsors/${f.participantId}/profile`, method: "PUT", body: { amountOverride: 5 } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventSponsorProfile.count({ where: { participantId: f.participantId } }), 0),
  },
  {
    name: "staff profile PUT",
    change: "downgrade",
    participantType: "STAFF",
    request: (f) => ({ path: `/api/events/${f.eventId}/staff/${f.participantId}/profile`, method: "PUT", body: { department: "Unauthorized" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventStaffProfile.count({ where: { participantId: f.participantId } }), 0),
  },
  {
    name: "vendor profile PUT",
    change: "revoke",
    participantType: "VENDOR",
    request: (f) => ({ path: `/api/events/${f.eventId}/vendors/${f.participantId}/profile`, method: "PUT", body: { contactName: "Unauthorized" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventVendorProfile.count({ where: { participantId: f.participantId } }), 0),
  },
  {
    name: "vendor service POST",
    change: "downgrade",
    request: (f) => ({ path: `/api/events/${f.eventId}/vendor-services`, method: "POST", body: { name: "Unauthorized service" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventVendorService.count({ where: { eventId: f.eventId } }), 0),
  },
  {
    name: "session POST",
    change: "revoke",
    request: (f) => ({ path: `/api/events/${f.eventId}/sessions`, method: "POST", body: { title: "Unauthorized session", date: "2027-11-01", startTime: "10:00", endTime: "11:00" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventSession.count({ where: { eventId: f.eventId } }), 0),
  },
  {
    name: "sponsor package POST",
    change: "downgrade",
    request: (f) => ({ path: `/api/events/${f.eventId}/sponsor-packages`, method: "POST", body: { name: "Unauthorized package" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventSponsorPackage.count({ where: { eventId: f.eventId } }), 0),
  },
  {
    name: "participant POST",
    change: "revoke",
    request: (f) => ({ path: `/api/events/${f.eventId}/participants`, method: "POST", body: { participantType: "PARTNER", name: "Unauthorized participant" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventParticipant.count({ where: { eventId: f.eventId } }), 0),
  },
  {
    name: "participant contact POST",
    change: "downgrade",
    participantType: "PARTNER",
    request: (f) => ({ path: `/api/events/${f.eventId}/participants/${f.participantId}/contacts`, method: "POST", body: { name: "Unauthorized contact", email: "leak@example.com" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventParticipantContact.count({ where: { participantId: f.participantId } }), 0),
  },
  {
    name: "participant contact list (personal data read)",
    change: "revoke",
    participantType: "PARTNER",
    request: (f) => ({ path: `/api/events/${f.eventId}/participants/${f.participantId}/contacts`, method: "GET" }),
    assertUntouched: async () => undefined,
  },
  {
    name: "venue allocation POST",
    change: "revoke",
    setup: async ({ eventId, ownerToken }) => {
      const venueResponse = await fetch(`${baseUrl}/api/venues`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: `Spec Lock Venue ${ts} ${counter}`, address: "1 Lock Road", city: "Ahmedabad", state: "Gujarat", country: "India" }),
      });
      assert.equal(venueResponse.status, 201);
      const venueId = (await venueResponse.json() as { venue: { id: string } }).venue.id;
      await prisma.event.update({ where: { id: eventId }, data: { venueId } });
    },
    request: (f) => ({ path: `/api/events/${f.eventId}/venue-allocations`, method: "POST", body: { scopeType: "venue", label: "Unauthorized allocation" } }),
    assertUntouched: async (f) => assert.equal(await prisma.eventVenueAllocation.count({ where: { eventId: f.eventId } }), 0),
  },
  {
    name: "participant activity feed read",
    change: "revoke",
    participantType: "PARTNER",
    request: (f) => ({ path: `/api/events/${f.eventId}/participants/${f.participantId}/activity`, method: "GET" }),
    assertUntouched: async () => undefined,
  },
];

for (const c of cases) {
  test(`${c.name} waits for organizer membership change and writes nothing`, async () => {
    counter += 1;
    const owner = await signup(`owner-${counter}`);
    const admin = await signup(`admin-${counter}`);
    const { eventId, organizerId } = await createEvent(owner.token, `case-${counter}`);
    const participant = c.participantType
      ? await prisma.eventParticipant.create({ data: { eventId, participantType: c.participantType, name: `${c.name} target`, isPublic: true } })
      : null;
    const membership = await prisma.organizerMembership.create({
      data: { organizerId, userId: admin.userId, role: "admin", status: "active" },
    });
    await c.setup?.({ eventId, ownerToken: owner.token });
    const fixture: Fixture = { eventId, participantId: participant?.id ?? "" };
    const req = c.request(fixture);

    const held = await holdOrganizerMembershipChange(organizerId, membership.id, c.change);
    const responsePromise = fetch(`${baseUrl}${req.path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    try {
      await waitForBlockedOrganizerAccess(held.blockerPid);
    } finally {
      held.release();
      await held.transaction;
    }

    const response = await responsePromise;
    assert.equal(response.status, 404, `${c.name} must be denied after the membership ${c.change}`);
    await c.assertUntouched(fixture);
  });
}

test("partner profile read waits for organizer membership revocation", async () => {
  counter += 1;
  const owner = await signup(`owner-${counter}`);
  const { eventId, organizerId } = await createEvent(owner.token, `read-${counter}`);
  const partner = await prisma.eventParticipant.create({ data: { eventId, participantType: "PARTNER", name: "Read target", isPublic: true } });
  const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { organizerId, userId: owner.userId, status: "active" } });

  const held = await holdOrganizerMembershipChange(organizerId, membership.id, "revoke");
  const responsePromise = fetch(`${baseUrl}/api/events/${eventId}/partners/${partner.id}/profile`, { headers: { Authorization: `Bearer ${owner.token}` } });
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }
  assert.equal((await responsePromise).status, 404, "a revoked member must not read the partner profile");
});
