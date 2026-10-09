import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function request(path: string, token: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

test("event authorization boundaries: cross-organizer reads and mutations cannot access, archive, or restore another tenant's Event", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "event-boundary-a", ts + 1);
  const orgB = await bootstrapOrganizer(baseUrl, "event-boundary-b", ts + 2);
  organizerIds.push(orgA.organizerId, orgB.organizerId);

  // Use a standalone Event so this test exercises the Universal Event
  // lifecycle without changing the bootstrap Exhibitions used by the fixtures.
  const event = await prisma.event.create({
    data: {
      organizerId: orgB.organizerId,
      ownerId: orgB.userId,
      title: `Tenant B protected event ${ts}`,
      eventType: "CONFERENCE",
      status: "DRAFT",
      visibility: "private",
      moduleEnablements: {
        create: [{ moduleType: "REGISTRATION", enabled: true }],
      },
    },
  });

  const read = await request(`/api/events/${event.id}`, orgA.token);
  assert.equal(read.status, 404, "another organizer must not read the Event");

  const readModules = await request(`/api/events/${event.id}/modules`, orgA.token);
  assert.equal(readModules.status, 404, "module configuration must not leak across organizers");

  const patch = await request(`/api/events/${event.id}`, orgA.token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Cross-tenant overwrite" }),
  });
  assert.equal(patch.status, 404, "another organizer must not update the Event");

  const enableModule = await request(`/api/events/${event.id}/modules/SESSIONS`, orgA.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableModule.status, 404, "another organizer must not enable modules");

  const archive = await request(`/api/events/${event.id}`, orgA.token, { method: "DELETE" });
  assert.equal(archive.status, 404, "another organizer must not archive the Event");

  const unchanged = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(unchanged.title, event.title);
  assert.equal(unchanged.archivedAt, null);
  const enablements = await prisma.eventModuleEnablement.findMany({
    where: { eventId: event.id },
    orderBy: { moduleType: "asc" },
  });
  assert.deepEqual(
    enablements.map(({ moduleType, enabled }) => ({ moduleType, enabled })),
    [{ moduleType: "REGISTRATION", enabled: true }],
    "rejected cross-tenant mutation must not change module configuration",
  );

  // Exercise restore separately against a genuinely archived Event. A
  // cross-tenant restore must not clear archivedAt or write a restore audit.
  const ownerArchive = await request(`/api/events/${event.id}`, orgB.token, { method: "DELETE" });
  assert.equal(ownerArchive.status, 204);
  const archivedAt = (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).archivedAt;
  assert.ok(archivedAt, "owner archive must persist before testing restore authorization");

  const restore = await request(`/api/events/${event.id}/restore`, orgA.token, { method: "POST" });
  assert.equal(restore.status, 404, "another organizer must not restore the Event");

  const stillArchived = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(stillArchived.archivedAt?.getTime(), archivedAt.getTime());
  assert.equal(
    await prisma.auditLog.count({
      where: { action: "event.restored", entityId: event.id, actorUserId: orgA.userId },
    }),
    0,
    "rejected cross-tenant restore must not create an audit entry",
  );
});
