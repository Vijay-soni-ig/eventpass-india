import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const eventIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventIds.length) {
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
  }
});

test("public organizer upcoming listing excludes private and unpublished canonical Events", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "organizer-event-visibility", ts);
  organizerIds.push(organizer.organizerId);
  const slug = `organizer-event-visibility-${ts}`;
  await prisma.organizer.update({
    where: { id: organizer.organizerId },
    data: { slug, publicProfileEnabled: true, suspended: false },
  });

  const common = {
    organizerId: organizer.organizerId,
    ownerId: organizer.userId,
    eventType: "CONFERENCE" as const,
    startDate: new Date("2028-03-01T00:00:00.000Z"),
    endDate: new Date("2028-03-02T00:00:00.000Z"),
  };
  const visible = await prisma.event.create({
    data: { ...common, title: `Visible Public Event ${ts}`, status: "PUBLISHED", visibility: "public" },
  });
  eventIds.push(visible.id);
  const privateEvent = await prisma.event.create({
    data: { ...common, title: `Private Event ${ts}`, status: "PUBLISHED", visibility: "private" },
  });
  eventIds.push(privateEvent.id);
  const draftEvent = await prisma.event.create({
    data: { ...common, title: `Draft Public Event ${ts}`, status: "DRAFT", visibility: "public" },
  });
  eventIds.push(draftEvent.id);

  const response = await fetch(`${baseUrl}/api/public/organizers/${slug}/events?type=upcoming`);
  assert.equal(response.status, 200);
  const body = await response.json() as { events: Array<{ id: string }>; total: number };
  const listedIds = body.events.map((event) => event.id);

  assert.ok(listedIds.includes(visible.id), "published, public, future Event should be listed");
  assert.equal(listedIds.includes(privateEvent.id), false, "private Event must not be listed publicly");
  assert.equal(listedIds.includes(draftEvent.id), false, "unpublished Event must not be listed publicly");
});
