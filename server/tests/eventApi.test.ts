import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

async function signup(label: string, userType: "exhibitor" | "visitor" = "exhibitor") {
  const email = `evtapi-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtApi ${label}`, userType }),
  }).then((r) => r.json());
  return { token: res.token as string, userId: res.user.id as string };
}

/** Bootstraps an organizer membership (owner role) by creating an Exhibition through the existing route — the only sanctioned way to acquire organizer:create access without a dedicated bootstrap endpoint. */
async function bootstrapOrganizerOwner(label: string) {
  const { token, userId } = await signup(label);
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `EvtApi bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  }).then((r) => r.json());
  return { token, userId, organizerId: res.exhibition.organizerId as string };
}

async function createStandaloneEvent(token: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `EvtApi Conference ${ts}`,
      status: "DRAFT",
      visibility: "public",
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json() };
}

test("Event creation: a genuinely independent CONFERENCE event is created and returned", async () => {
  const { token } = await bootstrapOrganizerOwner("create");
  const { status, body } = await createStandaloneEvent(token, { title: `Conf A ${ts}`, city: "Pune", venue: "Convention Hall" });
  assert.equal(status, 201);
  assert.equal(body.event.eventType, "CONFERENCE");
  assert.equal(body.event.title, `Conf A ${ts}`);
  assert.equal(body.event.status, "DRAFT");
});

test("Event creation with eventType EXHIBITION is rejected with a clear pointer to POST /api/exhibitions", async () => {
  const { token } = await bootstrapOrganizerOwner("reject-exhibition");
  const { status, body } = await createStandaloneEvent(token, { eventType: "EXHIBITION" });
  assert.equal(status, 400);
  assert.match(body.error, /\/api\/exhibitions/);

  const created = await prisma.exhibition.findFirst({ where: { name: `EvtApi Conference ${ts}` } });
  assert.equal(created, null, "rejecting the request must never create an Exhibition as a side effect");
});

test("Event retrieval: GET /api/events/:id returns the event with category and module info", async () => {
  const { token } = await bootstrapOrganizerOwner("retrieve");
  const { body: created } = await createStandaloneEvent(token, { title: `Retrieve Me ${ts}`, modules: ["SESSIONS"] });
  const res = await fetch(`${baseUrl}/api/events/${created.event.id}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.id, created.event.id);
  assert.equal(body.event.moduleEnablements.length, 1);
  assert.equal(body.event.moduleEnablements[0].moduleType, "SESSIONS");
});

test("Event list / search / filter / sort / pagination", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("list");
  await createStandaloneEvent(token, { title: `Zeta Listing ${ts}`, city: "Chennai", status: "PUBLISHED" });
  await createStandaloneEvent(token, { title: `Alpha Listing ${ts}`, city: "Chennai", status: "DRAFT" });
  await createStandaloneEvent(token, { title: `Beta Other City ${ts}`, city: "Mumbai", status: "DRAFT" });

  const listRes = await fetch(`${baseUrl}/api/events?organizerId=${organizerId}&page=1&limit=2&sort=title_asc`, { headers: { Authorization: `Bearer ${token}` } });
  const listBody = await listRes.json();
  assert.equal(listRes.status, 200);
  assert.equal(listBody.page, 1);
  assert.equal(listBody.pageSize, 2);
  assert.equal(listBody.events.length, 2);
  assert.ok(listBody.total >= 3);
  assert.equal(listBody.events[0].title, `Alpha Listing ${ts}`, "sort=title_asc must order alphabetically");

  const searchRes = await fetch(`${baseUrl}/api/events?search=${encodeURIComponent("Zeta Listing")}`, { headers: { Authorization: `Bearer ${token}` } });
  const searchBody = await searchRes.json();
  assert.equal(searchBody.events.length, 1);
  assert.equal(searchBody.events[0].title, `Zeta Listing ${ts}`);

  const cityRes = await fetch(`${baseUrl}/api/events?city=Mumbai`, { headers: { Authorization: `Bearer ${token}` } });
  const cityBody = await cityRes.json();
  assert.ok(cityBody.events.every((e: { city: string }) => e.city === "Mumbai"));

  const statusRes = await fetch(`${baseUrl}/api/events?status=DRAFT&city=Chennai`, { headers: { Authorization: `Bearer ${token}` } });
  const statusBody = await statusRes.json();
  assert.equal(statusBody.events.length, 1);
  assert.equal(statusBody.events[0].title, `Alpha Listing ${ts}`);
});

test("Event update: PATCH changes universal fields, requires event:update, and rejects invalid dates", async () => {
  const { token } = await bootstrapOrganizerOwner("update");
  const { body: created } = await createStandaloneEvent(token, { title: `Update Me ${ts}` });

  const okRes = await fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Updated Title", timezone: "America/New_York" }),
  });
  assert.equal(okRes.status, 200);
  const okBody = await okRes.json();
  assert.equal(okBody.event.title, "Updated Title");
  assert.equal(okBody.event.timezone, "America/New_York");

  const badDatesRes = await fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ startDate: "2027-05-10", endDate: "2027-05-01" }),
  });
  assert.equal(badDatesRes.status, 400);
});

test("Event archive/restore: DELETE soft-archives, PATCH is blocked while archived, restore clears archivedAt", async () => {
  const { token } = await bootstrapOrganizerOwner("archive");
  const { body: created } = await createStandaloneEvent(token, { title: `Archive Me ${ts}` });
  const eventId = created.event.id;

  const deleteRes = await fetch(`${baseUrl}/api/events/${eventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(deleteRes.status, 204);

  const archived = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.ok(archived.archivedAt, "archivedAt must be set");

  const patchWhileArchived = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Should not apply" }),
  });
  assert.equal(patchWhileArchived.status, 409);

  const restoreRes = await fetch(`${baseUrl}/api/events/${eventId}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restoreRes.status, 200);
  const restoreBody = await restoreRes.json();
  assert.equal(restoreBody.event.archivedAt, null);

  const patchAfterRestore = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: "Applies now" }),
  });
  assert.equal(patchAfterRestore.status, 200);
});

test("Invalid Event payloads are rejected with 400, not a 500", async () => {
  const { token } = await bootstrapOrganizerOwner("invalid");
  const missingTitle = await createStandaloneEvent(token, { title: undefined });
  assert.equal(missingTitle.status, 400);

  const badLatitude = await createStandaloneEvent(token, { latitude: 999 });
  assert.equal(badLatitude.status, 400);

  const badEventType = await createStandaloneEvent(token, { eventType: "NOT_A_REAL_TYPE" });
  assert.equal(badEventType.status, 400);
});

test("Category assignment: creating with a free-text category resolves/creates an EventCategory deterministically", async () => {
  const { token } = await bootstrapOrganizerOwner("category-assign");
  const categoryName = `EvtApi Category ${ts}`;
  const { status, body } = await createStandaloneEvent(token, { title: `Categorized ${ts}`, category: categoryName });
  assert.equal(status, 201);
  assert.ok(body.event.categoryId);

  const category = await prisma.eventCategory.findUnique({ where: { id: body.event.categoryId } });
  assert.equal(category?.name, categoryName);
});

test("Unauthorized Event access: no auth token is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/events`);
  assert.equal(res.status, 401);
});

test("Cross-organizer Event access and mutation: organizer A cannot read or write organizer B's Event (404, not 403 — no existence leak)", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("cross-a");
  const { token: tokenB } = await bootstrapOrganizerOwner("cross-b");
  const { body: createdA } = await createStandaloneEvent(tokenA, { title: `Cross Org Event ${ts}` });

  const readAsB = await fetch(`${baseUrl}/api/events/${createdA.event.id}`, { headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(readAsB.status, 404);

  const patchAsB = await fetch(`${baseUrl}/api/events/${createdA.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ title: "Hijacked" }),
  });
  assert.equal(patchAsB.status, 404);

  const deleteAsB = await fetch(`${baseUrl}/api/events/${createdA.event.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(deleteAsB.status, 404);

  const stillThere = await prisma.event.findUniqueOrThrow({ where: { id: createdA.event.id } });
  assert.equal(stillThere.archivedAt, null, "organizer B's failed delete attempt must not have archived organizer A's event");
});

test("Cannot escape permitted organizer scope via the organizerId query parameter", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("scope-a");
  const { organizerId: organizerIdB } = await bootstrapOrganizerOwner("scope-b");

  const res = await fetch(`${baseUrl}/api/events?organizerId=${organizerIdB}`, { headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.events.length, 0, "requesting another organizer's id must yield zero results, not their data");
});

test("Malformed/nonexistent Event ids are handled safely (404, no 500)", async () => {
  const { token } = await bootstrapOrganizerOwner("malformed");
  const res1 = await fetch(`${baseUrl}/api/events/not-a-real-id`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res1.status, 404);
  const res2 = await fetch(`${baseUrl}/api/events/${encodeURIComponent("'; DROP TABLE \"events\"; --")}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res2.status, 404);
  const stillWorks = await fetch(`${baseUrl}/api/events`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(stillWorks.status, 200);
});

test("Event permission matrix: a role without event:create cannot create an Event", async () => {
  const owner = await bootstrapOrganizerOwner("perm-owner");
  const { token: memberToken, userId: memberUserId } = await signup("perm-scanner");
  await prisma.organizerMembership.create({ data: { organizerId: owner.organizerId, userId: memberUserId, role: "scanner", status: "active" } });

  const createRes = await createStandaloneEvent(memberToken, { title: "Scanner attempt" });
  assert.equal(createRes.status, 403);
});

test("Event permission matrix: scanner role (event:view only) gets 404 attempting to update, not a silent success", async () => {
  const owner = await bootstrapOrganizerOwner("perm-owner-2");
  const { token: memberToken, userId: memberUserId } = await signup("perm-scanner-2");
  await prisma.organizerMembership.create({ data: { organizerId: owner.organizerId, userId: memberUserId, role: "scanner", status: "active" } });
  const { body: created } = await createStandaloneEvent(owner.token, { title: `Perm target 2 ${ts}` });

  const updateRes = await fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${memberToken}` },
    body: JSON.stringify({ title: "Should be blocked" }),
  });
  assert.equal(updateRes.status, 404);

  const readRes = await fetch(`${baseUrl}/api/events/${created.event.id}`, { headers: { Authorization: `Bearer ${memberToken}` } });
  assert.equal(readRes.status, 200, "scanner does have event:view, so read access is fine");
});
