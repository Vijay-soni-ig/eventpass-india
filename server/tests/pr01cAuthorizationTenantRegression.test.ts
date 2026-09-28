import { test, before, after } from "node:test";
import assert from "node:assert/strict";
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

async function signupUser(label: string, userType: "organizer" | "visitor" = "organizer") {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `pr01c-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `PR01C ${label}`,
      userType,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { token: body.token as string, userId: body.user.id as string };
}

test("Universal Event reads and mutations remain tenant-scoped for path and query IDs", async () => {
  const ownerA = await bootstrapOrganizer(baseUrl, "pr01c-event-a", ts + 1);
  const ownerB = await bootstrapOrganizer(baseUrl, "pr01c-event-b", ts + 2);
  organizerIds.push(ownerA.organizerId, ownerB.organizerId);

  const create = async (token: string, title: string) => {
    const response = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "CONFERENCE",
        title,
        status: "DRAFT",
        visibility: "private",
        modules: [],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    return body.event as { id: string; organizerId: string; title: string };
  };

  const eventA = await create(ownerA.token, "PR01C Event A");
  const eventB = await create(ownerB.token, "PR01C Event B");

  const queryEscape = await fetch(
    `${baseUrl}/api/events?organizerId=${encodeURIComponent(ownerB.organizerId)}`,
    { headers: { Authorization: `Bearer ${ownerA.token}` } },
  );
  const queryBody = await queryEscape.json();
  assert.equal(queryEscape.status, 200, JSON.stringify(queryBody));
  assert.equal(queryBody.total, 0);
  assert.deepEqual(queryBody.events, []);

  const read = await fetch(`${baseUrl}/api/events/${eventB.id}`, {
    headers: { Authorization: `Bearer ${ownerA.token}` },
  });
  assert.equal(read.status, 404, JSON.stringify(await read.json()));

  const write = await fetch(`${baseUrl}/api/events/${eventB.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${ownerA.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "PR01C Cross-Tenant Mutation" }),
  });
  assert.equal(write.status, 404, JSON.stringify(await write.json()));

  const untouched = await prisma.event.findUniqueOrThrow({
    where: { id: eventB.id },
    select: { organizerId: true, title: true },
  });
  assert.equal(untouched.organizerId, ownerB.organizerId);
  assert.equal(untouched.title, eventB.title);

  await prisma.event.deleteMany({ where: { id: { in: [eventA.id, eventB.id] } } });
});

test("Event operation permissions are enforced server-side, not by frontend role state", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "pr01c-rbac-owner", ts + 3);
  organizerIds.push(owner.organizerId);

  const created = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "PR01C RBAC Event",
      status: "DRAFT",
      visibility: "private",
      modules: [],
    }),
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const eventId = createdBody.event.id as string;

  const finance = await signupUser("finance");
  const scanner = await signupUser("scanner");
  const operations = await signupUser("operations");
  const visitor = await signupUser("visitor", "visitor");

  await prisma.organizerMembership.createMany({
    data: [
      { organizerId: owner.organizerId, userId: finance.userId, role: "finance", status: "active" },
      { organizerId: owner.organizerId, userId: scanner.userId, role: "scanner", status: "active" },
      { organizerId: owner.organizerId, userId: operations.userId, role: "operations", status: "active" },
    ],
  });

  const patch = async (token: string, title: string) => fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  const financePatch = await patch(finance.token, "Finance Must Not Edit");
  assert.equal(financePatch.status, 404, JSON.stringify(await financePatch.json()));

  const scannerPatch = await patch(scanner.token, "Scanner Must Not Edit");
  assert.equal(scannerPatch.status, 404, JSON.stringify(await scannerPatch.json()));

  const visitorPatch = await patch(visitor.token, "Visitor Must Not Edit");
  assert.equal(visitorPatch.status, 403, JSON.stringify(await visitorPatch.json()));

  const operationsPatch = await patch(operations.token, "Operations Can Edit");
  assert.equal(operationsPatch.status, 200, JSON.stringify(await operationsPatch.json()));

  const finalEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true } });
  assert.equal(finalEvent.title, "Operations Can Edit");

  await prisma.event.delete({ where: { id: eventId } });
  await prisma.user.deleteMany({
    where: { id: { in: [finance.userId, scanner.userId, operations.userId, visitor.userId] } },
  });
});
