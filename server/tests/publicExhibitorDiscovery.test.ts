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
      await prisma.eventExhibitorParticipation.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
  }
});

test("exhibitor discovery includes standalone Events only when EXHIBITORS is enabled and preserves type filters", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "public-exhibitor-discovery", ts);
  organizerIds.push(organizer.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: "Standalone exhibitor discovery " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
    },
    select: { id: true },
  });
  eventIds.push(event.id);

  const list = (query = "") => fetch(baseUrl + "/api/public/events?exhibitorEligible=true" + query);
  const beforeEnable = await list();
  assert.equal(beforeEnable.status, 200);
  const beforeBody = await beforeEnable.json();
  assert.equal(beforeBody.events.some((item: { id: string }) => item.id === event.id), false,
    "standalone Events without EXHIBITORS enabled must not appear in exhibitor discovery");

  await prisma.eventModuleEnablement.create({
    data: { eventId: event.id, moduleType: "EXHIBITORS", enabled: true },
  });

  const allEligible = await list();
  assert.equal(allEligible.status, 200);
  const allBody = await allEligible.json();
  assert.equal(allBody.events.some((item: { id: string; eventType: string; exhibition: { id: string } | null }) =>
    item.id === event.id && item.eventType === "CONFERENCE" && item.exhibition === null
  ), true, "enabled standalone Events must appear in exhibitor discovery");

  const conferenceOnly = await list("&eventType=CONFERENCE");
  assert.equal(conferenceOnly.status, 200);
  assert.equal((await conferenceOnly.json()).events.some((item: { id: string }) => item.id === event.id), true);

  const exhibitionOnly = await list("&eventType=EXHIBITION");
  assert.equal(exhibitionOnly.status, 200);
  assert.equal((await exhibitionOnly.json()).events.some((item: { id: string }) => item.id === event.id), false);

  await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
  const unpublished = await list();
  assert.equal(unpublished.status, 200);
  assert.equal((await unpublished.json()).events.some((item: { id: string }) => item.id === event.id), false,
    "unpublished standalone Events must remain hidden");
});
