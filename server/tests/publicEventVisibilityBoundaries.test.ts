import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
let eventId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventId) {
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
  }
});

test("public Event directories never expose private, unpublished, or archived Event data", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "public-visibility-boundary", ts);
  organizerIds.push(organizer.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: `Public visibility boundary ${ts}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
    },
  });
  eventId = event.id;
  await prisma.eventModuleEnablement.createMany({
    data: ["SPONSORS", "PARTNERS", "VENDORS", "SESSIONS"].map((moduleType) => ({
      eventId: event.id,
      moduleType: moduleType as "SPONSORS" | "PARTNERS" | "VENDORS" | "SESSIONS",
      enabled: true,
    })),
  });

  const paths = [
    `/api/public/events/${event.id}/sponsors`,
    `/api/public/events/${event.id}/partners/specialized`,
    `/api/public/events/${event.id}/vendors/specialized`,
    `/api/public/events/${event.id}/participants`,
    `/api/public/events/${event.id}/sessions`,
  ];

  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 200, `published public Event should expose the enabled public endpoint: ${path}`);
  }

  await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 404, `unpublished Event data must not be public: ${path}`);
  }

  await prisma.event.update({ where: { id: event.id }, data: { status: "PUBLISHED", visibility: "private" } });
  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 404, `private Event data must not be public: ${path}`);
  }

  await prisma.event.update({ where: { id: event.id }, data: { visibility: "public", archivedAt: new Date() } });
  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 404, `archived Event data must not be public: ${path}`);
  }
});
