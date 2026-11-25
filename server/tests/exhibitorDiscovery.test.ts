import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const standaloneEventIds: string[] = [];
let organizer: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let linkedEventId: string;
let conferenceEventId: string;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  organizer = await bootstrapOrganizer(baseUrl, `exhibitor-discovery-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const linked = await prisma.exhibition.findUniqueOrThrow({
    where: { id: organizer.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(linked.eventId, "fixture exhibition must be linked to a canonical Event");
  linkedEventId = linked.eventId;

  const unlinkedExhibitionEvent = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: `exhibitor-discovery-${ts} Unlinked Event`,
      eventType: "EXHIBITION",
      status: "PUBLISHED",
      visibility: "public",
    },
  });
  standaloneEventIds.push(unlinkedExhibitionEvent.id);

  const conference = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: `exhibitor-discovery-${ts} Conference`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
    },
  });
  conferenceEventId = conference.id;
  standaloneEventIds.push(conference.id);
  await prisma.eventModuleEnablement.create({
    data: { eventId: conference.id, moduleType: "EXHIBITORS", enabled: true },
  });
});

after(async () => {
  try {
    if (standaloneEventIds.length) {
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: standaloneEventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: standaloneEventIds } } });
    }
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function discover(query: string) {
  const response = await fetch(`${baseUrl}/api/public/events?${query}`);
  return { status: response.status, body: await response.json() };
}

test("exhibitor discovery returns only public canonical exhibition Events linked to an operational Exhibition", async () => {
  const { status, body } = await discover(`exhibitorEligible=true&q=${encodeURIComponent(`exhibitor-discovery-${ts}`)}&limit=50`);
  assert.equal(status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].id, linkedEventId);
  assert.equal(body.events[0].exhibition.id, organizer.firstExhibitionId);
});

test("exhibitor discovery excludes unpublished and private linked Events", async () => {
  await prisma.event.update({ where: { id: linkedEventId }, data: { status: "DRAFT" } });
  const unpublished = await discover(`exhibitorEligible=true&q=${encodeURIComponent(`exhibitor-discovery-${ts}`)}`);
  assert.equal(unpublished.status, 200);
  assert.equal(unpublished.body.total, 0);

  await prisma.event.update({ where: { id: linkedEventId }, data: { status: "PUBLISHED", visibility: "private" } });
  const privateEvent = await discover(`exhibitorEligible=true&q=${encodeURIComponent(`exhibitor-discovery-${ts}`)}`);
  assert.equal(privateEvent.status, 200);
  assert.equal(privateEvent.body.total, 0);

  // Restore the fixture so later tests assert pagination against a visible row.
  await prisma.event.update({ where: { id: linkedEventId }, data: { visibility: "public" } });
});

test("exhibitor discovery intersects explicit eventType filters with eligible Events", async () => {
  const conferences = await discover("exhibitorEligible=true&eventType=CONFERENCE");
  assert.equal(conferences.status, 200);
  assert.equal(conferences.body.events.some((event: { id: string }) => event.id === conferenceEventId), true,
    "an enabled standalone Conference must be included by the matching eventType filter");
  assert.equal(conferences.body.events.some((event: { id: string }) => event.id === linkedEventId), false,
    "a linked Exhibition must not leak into a Conference-filtered result");

  const exhibitions = await discover("exhibitorEligible=true&eventType=EXHIBITION");
  assert.equal(exhibitions.status, 200);
  assert.equal(exhibitions.body.events.some((event: { id: string }) => event.id === linkedEventId), true);
  assert.equal(exhibitions.body.events.some((event: { id: string }) => event.id === conferenceEventId), false);
});

test("exhibitor discovery keeps server-side pagination bounded", async () => {
  const { status, body } = await discover(`exhibitorEligible=true&q=${encodeURIComponent(`exhibitor-discovery-${ts}`)}&page=1&limit=1`);
  assert.equal(status, 200);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 1);
  assert.equal(body.events.length, 1);
  assert.equal(body.total, 1);
});
