import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const titlePrefix = `Specialized tenant isolation ${ts}`;
const emailPrefix = `specialized-tenant-${ts}-`;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    await prisma.event.deleteMany({ where: { title: { startsWith: titlePrefix } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  } finally {
    await stop();
  }
});

async function signup(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `${emailPrefix}${label}`,
    },
    body: JSON.stringify({
      email: `${emailPrefix}${label}@example.com`,
      password: "TestPassword123!",
      fullName: `Tenant Isolation ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token as string;
}

async function createEvent(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `${titlePrefix} ${label}`,
      status: "DRAFT",
      visibility: "private",
      modules: [],
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).event.id as string;
}

async function enableModule(token: string, eventId: string, module: string) {
  const response = await fetch(`${baseUrl}/api/events/${eventId}/modules/${module}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 200, `failed to enable ${module}`);
}

test("specialized vendor, staff, and partner profile APIs enforce tenant ownership", async () => {
  const [tokenA, tokenB] = await Promise.all([signup("a"), signup("b")]);
  const [eventA, eventB] = await Promise.all([
    createEvent(tokenA, "A"),
    createEvent(tokenB, "B"),
  ]);

  for (const [token, eventId] of [[tokenA, eventA], [tokenB, eventB]] as const) {
    await enableModule(token, eventId, "VENDORS");
    await enableModule(token, eventId, "PARTICIPANTS");
    await enableModule(token, eventId, "PARTNERS");
  }

  const [vendorA, staffA, partnerA] = await Promise.all([
    prisma.eventParticipant.create({
      data: { eventId: eventA, participantType: "VENDOR", name: "Tenant A Vendor", isPublic: false },
    }),
    prisma.eventParticipant.create({
      data: { eventId: eventA, participantType: "STAFF", name: "Tenant A Staff", isPublic: false },
    }),
    prisma.eventParticipant.create({
      data: { eventId: eventA, participantType: "PARTNER", name: "Tenant A Partner", isPublic: false },
    }),
  ]);

  const headers = { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" };
  const targets = [
    { label: "vendor", path: `vendors/${vendorA.id}/profile`, body: { contactName: "Unauthorized edit" } },
    { label: "staff", path: `staff/${staffA.id}/profile`, body: { department: "Unauthorized edit" } },
    { label: "partner", path: `partners/${partnerA.id}/profile`, body: { relationshipSummary: "Unauthorized edit" } },
  ];

  for (const target of targets) {
    const crossTenantEventRead = await fetch(
      `${baseUrl}/api/events/${eventA}/${target.path}`,
      { headers },
    );
    assert.equal(crossTenantEventRead.status, 404, `${target.label} event ownership must be enforced`);

    const crossTenantEventWrite = await fetch(
      `${baseUrl}/api/events/${eventA}/${target.path}`,
      { method: "PUT", headers, body: JSON.stringify(target.body) },
    );
    assert.equal(crossTenantEventWrite.status, 404, `${target.label} writes to another tenant must be rejected`);

    const mismatchedResourceRead = await fetch(
      `${baseUrl}/api/events/${eventB}/${target.path}`,
      { headers },
    );
    assert.equal(mismatchedResourceRead.status, 404, `${target.label} IDs must be scoped to the event`);

    const mismatchedResourceWrite = await fetch(
      `${baseUrl}/api/events/${eventB}/${target.path}`,
      { method: "PUT", headers, body: JSON.stringify(target.body) },
    );
    assert.equal(mismatchedResourceWrite.status, 404, `${target.label} cross-event writes must be rejected`);
  }

  const [vendorProfiles, staffProfiles, partnerProfiles] = await Promise.all([
    prisma.eventVendorProfile.count({ where: { eventId: eventA } }),
    prisma.eventStaffProfile.count({ where: { eventId: eventA } }),
    prisma.eventPartnerProfile.count({ where: { eventId: eventA } }),
  ]);
  assert.equal(vendorProfiles, 0, "unauthorized vendor writes must not persist");
  assert.equal(staffProfiles, 0, "unauthorized staff writes must not persist");
  assert.equal(partnerProfiles, 0, "unauthorized partner writes must not persist");
});
