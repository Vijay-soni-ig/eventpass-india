import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
let baseUrl: string; let stop: () => Promise<void>; const ts = Date.now();
before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });
async function signup(label: string) { const res = await fetch(baseUrl + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "staff-" + label }, body: JSON.stringify({ email: "staff-" + label + "-" + ts + "@example.com", password: "TestPassword123!", fullName: "Staff " + label, userType: "exhibitor" }) }); const body = await res.json(); return { token: body.token as string }; }
async function bootstrap(label: string) { const { token } = await signup(label); const res = await fetch(baseUrl + "/api/exhibitions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Staff bootstrap " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }) }); const body = await res.json(); const eventId = body.exhibition.eventId as string; const enable = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTICIPANTS", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ enabled: true }) }); assert.equal(enable.status, 200); return { token, eventId }; }
test("staff management: create, search, update, archive and restore", async () => { const { token, eventId } = await bootstrap("crud"); const create = await fetch(baseUrl + "/api/events/" + eventId + "/staff", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Alex Staff", title: "Event Coordinator", organization: "ExhibitTix", email: "staff@example.com", isPublic: false, sortOrder: 1 }) }); assert.equal(create.status, 201); const created = await create.json(); const staffId = created.staff.id as string; assert.equal(created.staff.participantType, "STAFF"); const search = await fetch(baseUrl + "/api/events/" + eventId + "/staff?search=Alex", { headers: { Authorization: "Bearer " + token } }); assert.equal(search.status, 200); assert.equal((await search.json()).total, 1); const update = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staffId, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ title: "Senior Event Coordinator" }) }); assert.equal(update.status, 200); assert.equal((await update.json()).staff.title, "Senior Event Coordinator"); const archive = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staffId, { method: "DELETE", headers: { Authorization: "Bearer " + token } }); assert.equal(archive.status, 204); const hidden = await fetch(baseUrl + "/api/events/" + eventId + "/staff", { headers: { Authorization: "Bearer " + token } }); assert.equal((await hidden.json()).total, 0); const restore = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staffId + "/restore", { method: "POST", headers: { Authorization: "Bearer " + token } }); assert.equal(restore.status, 200); });
test("staff management rejects mutation when participant module is disabled", async () => { const { token } = await signup("blocked"); const res = await fetch(baseUrl + "/api/exhibitions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Staff blocked " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }) }); const body = await res.json(); const eventId = body.exhibition.eventId as string; const create = await fetch(baseUrl + "/api/events/" + eventId + "/staff", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Blocked Staff" }) }); assert.equal(create.status, 409); });
test("staff management keeps tenant boundary", async () => { const a = await bootstrap("cross-a"); const b = await bootstrap("cross-b"); const res = await fetch(baseUrl + "/api/events/" + a.eventId + "/staff", { headers: { Authorization: "Bearer " + b.token } }); assert.equal(res.status, 404); await prisma.eventParticipant.deleteMany({ where: { eventId: a.eventId } }); });


test("staff child-resource mutations cannot cross Event tenant boundaries", async () => {
  const ownerA = await bootstrap("tenant-mutation-a");
  const ownerB = await bootstrap("tenant-mutation-b");

  const created = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerA.token },
    body: JSON.stringify({"name":"Tenant A Protected Staff","title":"Original Staff Title","isPublic":false}),
  });
  assert.equal(created.status, 201);
  const childId = (await created.json()).staff.id as string;

  const wrongEventPatch = await fetch(baseUrl + "/api/events/" + ownerB.eventId + "/staff/" + childId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerB.token },
    body: JSON.stringify({ title: "Unauthorized wrong-event mutation" }),
  });
  assert.equal(wrongEventPatch.status, 404);

  const crossTenantPatch = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/staff/" + childId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerB.token },
    body: JSON.stringify({ title: "Unauthorized cross-tenant mutation" }),
  });
  assert.equal(crossTenantPatch.status, 404);

  const crossTenantArchive = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/staff/" + childId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + ownerB.token },
  });
  assert.equal(crossTenantArchive.status, 404);

  const crossTenantRestore = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/staff/" + childId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + ownerB.token },
  });
  assert.equal(crossTenantRestore.status, 404);

  const persisted = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: childId } });
  assert.equal(persisted.name, "Tenant A Protected Staff", "rejected writes must not change the source record");
  assert.equal(persisted.eventId, ownerA.eventId);
  assert.equal(persisted.archivedAt, null, "rejected archive must not change archive state");

  await prisma.eventParticipant.deleteMany({ where: { eventId: ownerA.eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: ownerB.eventId } });
});


test("disabled PARTICIPANTS module blocks staff create, update, archive, and restore without changing data", async () => {
  const { token, eventId } = await bootstrap("disabled-crud-gates");
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };

  async function createStaff(name: string) {
    const response = await fetch(baseUrl + "/api/events/" + eventId + "/staff", {
      method: "POST",
      headers,
      body: JSON.stringify({ name, isPublic: false }),
    });
    assert.equal(response.status, 201);
    return (await response.json()).staff.id as string;
  }

  const activeId = await createStaff("Protected active staff");
  const archivedId = await createStaff("Protected archived staff");
  const archiveBeforeDisable = await fetch(
    baseUrl + "/api/events/" + eventId + "/staff/" + archivedId,
    { method: "DELETE", headers: { Authorization: "Bearer " + token } },
  );
  assert.equal(archiveBeforeDisable.status, 204);

  const disable = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTICIPANTS", {
    method: "PUT",
    headers,
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disable.status, 200);

  const before = await prisma.eventParticipant.findMany({
    where: { eventId, id: { in: [activeId, archivedId] } },
    select: { id: true, name: true, status: true, archivedAt: true, isPublic: true },
    orderBy: { id: "asc" },
  });

  const createBlocked = await fetch(baseUrl + "/api/events/" + eventId + "/staff", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Must not be created", isPublic: false }),
  });
  assert.equal(createBlocked.status, 409);

  const updateBlocked = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + activeId, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "Unauthorized update" }),
  });
  assert.equal(updateBlocked.status, 409);

  const archiveBlocked = await fetch(
    baseUrl + "/api/events/" + eventId + "/staff/" + activeId,
    { method: "DELETE", headers: { Authorization: "Bearer " + token } },
  );
  assert.equal(archiveBlocked.status, 409);

  const restoreBlocked = await fetch(
    baseUrl + "/api/events/" + eventId + "/staff/" + archivedId + "/restore",
    { method: "POST", headers: { Authorization: "Bearer " + token } },
  );
  assert.equal(restoreBlocked.status, 409);

  const after = await prisma.eventParticipant.findMany({
    where: { eventId, id: { in: [activeId, archivedId] } },
    select: { id: true, name: true, status: true, archivedAt: true, isPublic: true },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(after, before, "disabled-module requests must not mutate staff records");
  assert.equal(
    await prisma.eventParticipant.count({ where: { eventId, name: "Must not be created" } }),
    0,
    "disabled-module create must not insert a staff record",
  );
});
