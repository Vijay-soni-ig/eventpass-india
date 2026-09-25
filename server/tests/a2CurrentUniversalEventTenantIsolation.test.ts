import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function auth(url: string, token: string, init: RequestInit = {}) {
  return fetch(baseUrl + url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

test("A2 current universal-event child resources reject cross-organizer access", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "a2-current-a", ts + 1);
  const orgB = await bootstrapOrganizer(baseUrl, "a2-current-b", ts + 2);
  organizerIds.push(orgA.organizerId, orgB.organizerId);

  const bExhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: orgB.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(bExhibition.eventId);
  const eventId = bExhibition.eventId;

  for (const moduleType of ["PARTICIPANTS", "SESSIONS", "SPONSORS"] as const) {
    await prisma.eventModuleEnablement.upsert({
      where: { eventId_moduleType: { eventId, moduleType } },
      update: { enabled: true },
      create: { eventId, moduleType, enabled: true },
    });
  }

  const sponsor = await prisma.eventParticipant.create({
    data: {
      eventId,
      participantType: "SPONSOR",
      name: "Tenant B Sponsor",
      isPublic: true,
    },
  });

  const contact = await prisma.eventParticipantContact.create({
    data: {
      eventId,
      participantId: sponsor.id,
      name: "Sponsor Contact",
      email: "contact@example.com",
    },
  });

  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: sponsor.id,
      kind: "LOGO",
      visibility: "PUBLIC",
      fileUrl: "participant-media-public/test.png",
      mimeType: "image/png",
      fileSizeBytes: 10,
      uploadedByUserId: orgB.userId,
    },
  });

  const session = await prisma.eventSession.create({
    data: {
      eventId,
      title: "Tenant B Session",
      date: new Date("2026-10-01T00:00:00.000Z"),
      startTime: "10:00",
      endTime: "11:00",
    },
  });

  const sponsorPackage = await prisma.eventSponsorPackage.create({
    data: {
      eventId,
      name: "Tenant B Gold",
      amount: 10000,
      currency: "INR",
      benefits: ["Logo"],
      deliverables: ["Stage mention"],
    },
  });

  const sponsorProfile = await prisma.eventSponsorProfile.create({
    data: {
      eventId,
      participantId: sponsor.id,
      packageId: sponsorPackage.id,
    },
  });

  const cases: Array<{ name: string; read: string; patch?: string; remove?: string; body?: object }> = [
    {
      name: "contacts",
      read: `/api/events/${eventId}/participants/${sponsor.id}/contacts`,
      patch: `/api/events/${eventId}/participants/${sponsor.id}/contacts/${contact.id}`,
      remove: `/api/events/${eventId}/participants/${sponsor.id}/contacts/${contact.id}`,
      body: { name: "Cross-tenant contact mutation" },
    },
    {
      name: "media",
      read: `/api/events/${eventId}/participants/${sponsor.id}/media`,
      patch: `/api/events/${eventId}/participants/${sponsor.id}/media/${media.id}`,
      remove: `/api/events/${eventId}/participants/${sponsor.id}/media/${media.id}`,
      body: { caption: "Cross-tenant media mutation" },
    },
    {
      name: "sessions",
      read: `/api/events/${eventId}/sessions`,
      patch: `/api/events/${eventId}/sessions/${session.id}`,
      remove: `/api/events/${eventId}/sessions/${session.id}`,
      body: { title: "Cross-tenant session mutation" },
    },
    {
      name: "sponsor-packages",
      read: `/api/events/${eventId}/sponsor-packages`,
      patch: `/api/events/${eventId}/sponsor-packages/${sponsorPackage.id}`,
      remove: `/api/events/${eventId}/sponsor-packages/${sponsorPackage.id}`,
      body: { name: "Cross-tenant package mutation" },
    },
    {
      name: "sponsor-profile",
      read: `/api/events/${eventId}/sponsors/${sponsor.id}/profile`,
      patch: `/api/events/${eventId}/sponsors/${sponsor.id}/profile`,
      body: { displayWebsite: "https://attacker.example.com" },
    },
  ];

  for (const item of cases) {
    const read = await auth(item.read, orgA.token);
    assert.equal(read.status, 404, `${item.name} read: ${await read.text()}`);

    if (item.patch) {
      const patch = await auth(item.patch, orgA.token, {
        method: item.name === "sponsor-profile" ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body ?? {}),
      });
      assert.equal(patch.status, 404, `${item.name} mutation: ${await patch.text()}`);
    }

    if (item.remove) {
      const remove = await auth(item.remove, orgA.token, { method: "DELETE" });
      assert.equal(remove.status, 404, `${item.name} delete: ${await remove.text()}`);
    }
  }

  const untouched = await Promise.all([
    prisma.eventParticipantContact.findUnique({ where: { id: contact.id }, select: { name: true, archivedAt: true } }),
    prisma.eventParticipantMedia.findUnique({ where: { id: media.id }, select: { caption: true, archivedAt: true } }),
    prisma.eventSession.findUnique({ where: { id: session.id }, select: { title: true, status: true } }),
    prisma.eventSponsorPackage.findUnique({ where: { id: sponsorPackage.id }, select: { name: true, status: true } }),
    prisma.eventSponsorProfile.findUnique({ where: { id: sponsorProfile.id }, select: { displayWebsite: true, eventId: true } }),
  ]);

  assert.deepEqual(untouched[0], { name: "Sponsor Contact", archivedAt: null });
  assert.deepEqual(untouched[1], { caption: null, archivedAt: null });
  assert.equal(untouched[2]?.title, "Tenant B Session");
  assert.equal(untouched[3]?.name, "Tenant B Gold");
  assert.equal(untouched[4]?.displayWebsite, null);
  assert.equal(untouched[4]?.eventId, eventId);
});
