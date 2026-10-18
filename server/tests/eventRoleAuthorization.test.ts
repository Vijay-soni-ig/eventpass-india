import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const extraUserIds: string[] = [];
const eventIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (eventIds.length > 0) {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await cleanupOrganizers(organizerIds);
  if (extraUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
  }
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

async function createReadOnlyTeamMember(
  organizerId: string,
  role: "finance" | "marketing" | "scanner",
) {
  const email = `event-role-${role}-${ts}-${extraUserIds.length}@example.com`;
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": email,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Event role ${role}`,
      userType: "visitor",
    }),
  });
  const signup = await response.json() as { token: string; user: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(signup));
  extraUserIds.push(signup.user.id);

  await prisma.organizerMembership.create({
    data: {
      organizerId,
      userId: signup.user.id,
      role,
      status: "active",
    },
  });

  return { token: signup.token, userId: signup.user.id };
}

test("Event read-only organizer roles can view Events but cannot mutate Event state or module enablements", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "event-role-boundary-owner", ts);
  organizerIds.push(owner.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: owner.organizerId,
      ownerId: owner.userId,
      title: `Read-only authorization event ${ts}`,
      eventType: "CONFERENCE",
      status: "DRAFT",
      visibility: "private",
      moduleEnablements: {
        create: [{ moduleType: "REGISTRATION", enabled: true }],
      },
    },
  });
  eventIds.push(event.id);

  const readOnlyRoles = ["finance", "marketing", "scanner"] as const;
  for (const role of readOnlyRoles) {
    const member = await createReadOnlyTeamMember(owner.organizerId, role);

    const read = await request(`/api/events/${event.id}`, member.token);
    assert.equal(read.status, 200, `${role} should retain event:view access: ${await read.text()}`);

    const readModules = await request(`/api/events/${event.id}/modules`, member.token);
    assert.equal(readModules.status, 200, `${role} should be able to inspect module configuration: ${await readModules.text()}`);

    const update = await request(`/api/events/${event.id}`, member.token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Unauthorized update by ${role}` }),
    });
    assert.equal(update.status, 404, `${role} must not update an Event`);

    const enableModule = await request(`/api/events/${event.id}/modules/SESSIONS`, member.token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enableModule.status, 404, `${role} must not enable Event modules`);

    const archive = await request(`/api/events/${event.id}`, member.token, { method: "DELETE" });
    assert.equal(archive.status, 404, `${role} must not archive an Event`);
  }

  const unchanged = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(unchanged.title, event.title, "denied PATCH requests must not mutate the Event");
  assert.equal(unchanged.archivedAt, null, "denied DELETE requests must not archive the Event");

  const enablements = await prisma.eventModuleEnablement.findMany({
    where: { eventId: event.id },
    orderBy: { moduleType: "asc" },
    select: { moduleType: true, enabled: true },
  });
  assert.deepEqual(
    enablements.map(({ moduleType, enabled }) => ({ moduleType, enabled })),
    [{ moduleType: "REGISTRATION", enabled: true }],
    "denied module writes must leave the original enablements unchanged",
  );

  // Positive control: the owner can still perform the same operations.
  const ownerUpdate = await request(`/api/events/${event.id}`, owner.token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Owner-authorized update ${ts}` }),
  });
  assert.equal(ownerUpdate.status, 200, `owner update must remain available: ${await ownerUpdate.text()}`);

  const ownerEnableModule = await request(`/api/events/${event.id}/modules/SESSIONS`, owner.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(ownerEnableModule.status, 200, `owner module management must remain available: ${await ownerEnableModule.text()}`);

  const finalEvent = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(finalEvent.title, `Owner-authorized update ${ts}`);
  assert.equal(
    await prisma.eventModuleEnablement.count({ where: { eventId: event.id, moduleType: "SESSIONS", enabled: true } }),
    1,
  );
});
