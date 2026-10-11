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
  if (eventIds.length) {
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("universal-event check-in summary enforces organizer tenant ownership and module enablement", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "checkin-summary-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "checkin-summary-other", ts + 1);
  organizerIds.push(owner.organizerId, other.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: owner.organizerId,
      ownerId: owner.userId,
      title: `Check-in Summary Boundary ${ts}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-03-01T10:00:00Z"),
      endDate: new Date("2030-03-01T18:00:00Z"),
    },
  });
  eventIds.push(event.id);

  const summaryUrl = `${baseUrl}/api/event-ticket-check-ins/summary?eventId=${event.id}`;
  const ownerHeaders = { Authorization: `Bearer ${owner.token}` };
  const otherHeaders = { Authorization: `Bearer ${other.token}` };

  const disabled = await fetch(summaryUrl, { headers: ownerHeaders });
  assert.equal(disabled.status, 409, "the owner cannot use check-in before enabling the module");

  await prisma.eventModuleEnablement.create({
    data: { eventId: event.id, moduleType: "CHECK_IN", enabled: true },
  });

  const allowed = await fetch(summaryUrl, { headers: ownerHeaders });
  assert.equal(allowed.status, 200, "the event owner can read the enabled check-in summary");
  const summary = await allowed.json() as { event: { id: string }; counts: { total: number; used: number }; recentScans: unknown[] };
  assert.equal(summary.event.id, event.id);
  assert.equal(summary.counts.total, 0);
  assert.equal(summary.counts.used, 0);
  assert.deepEqual(summary.recentScans, []);

  const denied = await fetch(summaryUrl, { headers: otherHeaders });
  assert.equal(denied.status, 403, "another organizer cannot inspect this event's check-in summary");
});
