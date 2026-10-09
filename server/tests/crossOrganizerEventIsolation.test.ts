import { test, before, after } from "node:test";
import assert from "node:assert/strict";
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

test("organizer cannot read or list another organizer's universal Event by ID or organizer filter", async () => {
  const owner = await bootstrapOrganizer(baseUrl, `event-tenant-owner-${ts}`, ts);
  organizerIds.push(owner.organizerId);
  const other = await bootstrapOrganizer(baseUrl, `event-tenant-other-${ts}`, ts);
  organizerIds.push(other.organizerId);

  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: owner.firstExhibitionId },
    select: { organizerId: true, eventId: true },
  });
  assert.equal(exhibition.organizerId, owner.organizerId);
  assert.ok(exhibition.eventId, "the exhibition fixture should have its linked universal Event");

  const directRead = await fetch(`${baseUrl}/api/events/${exhibition.eventId}`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(directRead.status, 404, "cross-organizer event ID must be indistinguishable from a missing event");

  const filteredList = await fetch(
    `${baseUrl}/api/events?organizerId=${encodeURIComponent(owner.organizerId)}`,
    { headers: { Authorization: `Bearer ${other.token}` } },
  );
  assert.equal(filteredList.status, 200);
  const filteredBody = await filteredList.json() as { events: Array<{ id: string }>; total: number };
  assert.equal(filteredBody.total, 0, "unauthorized organizer filter must return no events");
  assert.equal(filteredBody.events.length, 0, "unauthorized organizer filter must not disclose event data");

  const ownScopeList = await fetch(`${baseUrl}/api/events`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(ownScopeList.status, 200);
  const ownScopeBody = await ownScopeList.json() as { events: Array<{ id: string }> };
  assert.ok(
    ownScopeBody.events.every((event) => event.id !== exhibition.eventId),
    "default list must not include another organizer's event",
  );
});
