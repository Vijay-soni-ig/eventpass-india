import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    await prisma.event.deleteMany({ where: { title: { startsWith: `Disabled vendor/staff modules ${ts}` } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `vendor-staff-disabled-${ts}-` } } });
  } finally {
    await stop();
  }
});

test("vendor and staff specialization APIs reject direct access when their modules are disabled", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `vendor-staff-disabled-${ts}`,
    },
    body: JSON.stringify({
      email: `vendor-staff-disabled-${ts}-organizer@example.com`,
      password: "TestPassword123!",
      fullName: "Disabled Vendor Staff Test",
      userType: "organizer",
    }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json();

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Disabled vendor/staff modules ${ts}`,
      status: "DRAFT",
      visibility: "private",
      modules: [],
    }),
  });
  assert.equal(eventResponse.status, 201);
  const { event } = await eventResponse.json();

  const [vendor, staff, partner] = await Promise.all([
    prisma.eventParticipant.create({
      data: { eventId: event.id, participantType: "VENDOR", name: "Disabled vendor fixture", isPublic: false },
    }),
    prisma.eventParticipant.create({
      data: { eventId: event.id, participantType: "STAFF", name: "Disabled staff fixture", isPublic: false },
    }),
    prisma.eventParticipant.create({
      data: { eventId: event.id, participantType: "PARTNER", name: "Disabled partner fixture", isPublic: false },
    }),
  ]);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const blockedRequests: Array<{ label: string; request: Promise<Response> }> = [
    {
      label: "vendor service listing",
      request: fetch(`${baseUrl}/api/events/${event.id}/vendor-services`, { headers }),
    },
    {
      label: "vendor service creation",
      request: fetch(`${baseUrl}/api/events/${event.id}/vendor-services`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Must not be created" }),
      }),
    },
    {
      label: "vendor profile read",
      request: fetch(`${baseUrl}/api/events/${event.id}/vendors/${vendor.id}/profile`, { headers }),
    },
    {
      label: "vendor profile write",
      request: fetch(`${baseUrl}/api/events/${event.id}/vendors/${vendor.id}/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ contactName: "Must not be saved" }),
      }),
    },
    {
      label: "staff profile read",
      request: fetch(`${baseUrl}/api/events/${event.id}/staff/${staff.id}/profile`, { headers }),
    },
    {
      label: "staff profile write",
      request: fetch(`${baseUrl}/api/events/${event.id}/staff/${staff.id}/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ department: "Must not be saved" }),
      }),
    },
    {
      label: "partner profile read",
      request: fetch(`${baseUrl}/api/events/${event.id}/partners/${partner.id}/profile`, { headers }),
    },
    {
      label: "partner profile write",
      request: fetch(`${baseUrl}/api/events/${event.id}/partners/${partner.id}/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ relationshipSummary: "Must not be saved" }),
      }),
    },
  ];

  for (const { label, request } of blockedRequests) {
    const response = await request;
    assert.equal(response.status, 409, `${label} must be blocked while its module is disabled`);
  }

  const [serviceCount, vendorProfileCount, staffProfileCount, partnerProfileCount] = await Promise.all([
    prisma.eventVendorService.count({ where: { eventId: event.id } }),
    prisma.eventVendorProfile.count({ where: { eventId: event.id } }),
    prisma.eventStaffProfile.count({ where: { eventId: event.id } }),
    prisma.eventPartnerProfile.count({ where: { eventId: event.id } }),
  ]);
  assert.equal(serviceCount, 0, "blocked vendor service creation must not persist a service");
  assert.equal(vendorProfileCount, 0, "blocked vendor profile writes must not persist a profile");
  assert.equal(staffProfileCount, 0, "blocked staff profile writes must not persist a profile");
  assert.equal(partnerProfileCount, 0, "blocked partner profile writes must not persist a profile");
});
