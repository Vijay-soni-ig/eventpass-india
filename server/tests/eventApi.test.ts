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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-api-${label}` },
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
  await createStandaloneEvent(token, { title: `Zeta Listing ${ts}`, city: "Chennai", venue: "Chennai Convention Centre", startDate: "2027-06-01", endDate: "2027-06-02", status: "PUBLISHED" });
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

test("Event module read: archived events cannot expose module configuration", async () => {
  const { token } = await bootstrapOrganizerOwner("module-read-archive");
  const { body: created } = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Archived Module Read ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const deleteRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteRes.status, 204);

  const readRes = await fetch(`${baseUrl}/api/events/${eventId}/modules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(readRes.status, 409);
});

test("Archived Events reject organizer operational API reads", async () => {
  const { token } = await bootstrapOrganizerOwner("archive-operational-apis");
  const created = await createStandaloneEvent(token, {
    eventType: "CONFERENCE",
    title: `Archived Operational API Guard ${ts}`,
    city: "Ahmedabad",
    venue: "Operational Guard Venue",
    startDate: "2028-04-01",
    endDate: "2028-04-02",
    modules: ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS", "SESSIONS"],
  });
  assert.equal(created.status, 201);
  const eventId = created.body.event.id as string;

  const archiveRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveRes.status, 204);

  const checks = [
    [`/api/events/${eventId}/participants`, "participants"],
    [`/api/events/${eventId}/speakers`, "speakers"],
    [`/api/events/${eventId}/sponsors`, "sponsors"],
    [`/api/events/${eventId}/partners`, "partners"],
    [`/api/events/${eventId}/vendors`, "vendors"],
    [`/api/events/${eventId}/sessions`, "sessions"],
    [`/api/events/${eventId}/staff`, "staff"],
    [`/api/organizer/event-analytics/${eventId}`, "analytics"],
  ] as const;

  for (const [path, label] of checks) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 404, `archived event must block ${label} reads`);
  }
});

test("Archived linked Events reject legacy ticket purchase", async () => {
  const { token: organizerToken, organizerId } = await bootstrapOrganizerOwner("archive-legacy-ticket");
  const exhibition = await prisma.exhibition.findFirstOrThrow({
    where: { organizerId },
    include: { event: true },
  });
  assert.ok(exhibition.event, "bootstrap exhibition must have a linked canonical Event");

  await prisma.exhibition.update({
    where: { id: exhibition.id },
    data: {
      status: "live",
      visibility: "public",
      venue: "Archive Ticket Venue",
      city: "Ahmedabad",
      startDate: new Date("2028-05-01"),
      endDate: new Date("2028-05-02"),
    },
  });
  const ticketType = await prisma.ticketType.create({
    data: { exhibitionId: exhibition.id, name: "General", price: 0, quantity: 10, visible: true },
  });

  const archiveRes = await fetch(`${baseUrl}/api/events/${exhibition.event!.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  assert.equal(archiveRes.status, 204);

  const { token: visitorToken } = await signup("archive-legacy-ticket-buyer", "visitor");
  const purchaseRes = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitorToken}` },
    body: JSON.stringify({
      exhibitionId: exhibition.id,
      ticketTypeId: ticketType.id,
      attendeeName: "Archive Test Visitor",
      attendeeEmail: `evtapi-archive-legacy-ticket-buyer-${ts}@example.com`,
      quantity: 1,
    }),
  });
  assert.equal(purchaseRes.status, 404, "archived linked Events must block legacy ticket purchases");
});

test("Archived linked Events block legacy organizer exhibition administration", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("archive-legacy-admin");
  const exhibition = await prisma.exhibition.findFirstOrThrow({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
    include: { event: { select: { id: true } } },
  });
  assert.ok(exhibition.event?.id, "bootstrap exhibition must have a linked canonical Event");

  const archiveRes = await fetch(`${baseUrl}/api/events/${exhibition.event!.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveRes.status, 204);

  const listRes = await fetch(`${baseUrl}/api/exhibitions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.ok(
    !listBody.exhibitions.some((item: { id: string }) => item.id === exhibition.id),
    "archived linked Exhibition must be excluded from active organizer listings",
  );

  const blockedRequests = [
    {
      label: "detail",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      expected: 404,
    },
    {
      label: "update",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Should not update" }),
      }),
      expected: 404,
    },
    {
      label: "duplicate",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
      expected: 404,
    },
    {
      label: "delete",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),
      expected: 404,
    },
    {
      label: "ticket creation",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Blocked", price: 10, quantity: 1, taxPercent: 0, visible: true }),
      }),
      expected: 404,
    },
    {
      label: "stall creation",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}/stalls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: "BLOCKED-1", price: 10 }),
      }),
      expected: 404,
    },
    {
      label: "exhibitor listing",
      request: () => fetch(`${baseUrl}/api/exhibitions/${exhibition.id}/exhibitors`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      expected: 404,
    },
  ];

  for (const { label, request, expected } of blockedRequests) {
    const response = await request();
    assert.equal(response.status, expected, `archived linked Exhibition must block legacy ${label}`);
  }
});

test("Archived linked Events are hidden from exhibitor participation listings", async () => {
  const { token: organizerToken, organizerId } = await bootstrapOrganizerOwner("archive-exhibitor-list");
  const exhibition = await prisma.exhibition.findFirstOrThrow({
    where: { organizerId },
    orderBy: { createdAt: "desc" },
    include: { event: { select: { id: true } } },
  });
  assert.ok(exhibition.event?.id, "bootstrap exhibition must have a linked canonical Event");

  const exhibitor = await signup("archive-exhibitor-list-business", "exhibitor");
  const business = await prisma.exhibitorBusiness.findFirstOrThrow({
    where: { ownerId: exhibitor.userId },
  });
  await prisma.exhibitionExhibitor.create({
    data: { exhibitionId: exhibition.id, exhibitorBusinessId: business.id, status: "approved" },
  });

  const beforeArchive = await fetch(`${baseUrl}/api/exhibitor-participations`, {
    headers: { Authorization: `Bearer ${exhibitor.token}` },
  });
  assert.equal(beforeArchive.status, 200);
  const beforeBody = await beforeArchive.json();
  assert.ok(beforeBody.participations.some((item: { id: string }) => item.exhibitionId === exhibition.id));

  const archiveRes = await fetch(`${baseUrl}/api/events/${exhibition.event!.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${organizerToken}` },
  });
  assert.equal(archiveRes.status, 204);

  const afterArchive = await fetch(`${baseUrl}/api/exhibitor-participations`, {
    headers: { Authorization: `Bearer ${exhibitor.token}` },
  });
  assert.equal(afterArchive.status, 200);
  const afterBody = await afterArchive.json();
  assert.ok(
    !afterBody.participations.some((item: { exhibitionId: string }) => item.exhibitionId === exhibition.id),
    "archived linked Exhibition must not remain in active exhibitor participation listings",
  );
});

test("Public organizer event listing excludes archived canonical Events", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("public-organizer-archive");
  const organizerSlug = `public-organizer-archive-${ts}`;
  await prisma.organizer.update({
    where: { id: organizerId },
    data: { slug: organizerSlug, publicProfileEnabled: true, suspended: false },
  });

  const created = await createStandaloneEvent(token, {
    title: `Archived Public Organizer Event ${ts}`,
    city: "Ahmedabad",
    venue: "Archive Venue",
    startDate: "2028-03-01",
    endDate: "2028-03-02",
    status: "PUBLISHED",
    visibility: "public",
  });
  assert.equal(created.status, 201);

  const beforeArchive = await fetch(`${baseUrl}/api/public/organizers/${organizerSlug}/events?type=upcoming`);
  assert.equal(beforeArchive.status, 200);
  const beforeBody = await beforeArchive.json();
  assert.ok(beforeBody.events.some((event: { id: string }) => event.id === created.body.event.id));

  const archiveRes = await fetch(`${baseUrl}/api/events/${created.body.event.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveRes.status, 204);

  const afterArchive = await fetch(`${baseUrl}/api/public/organizers/${organizerSlug}/events?type=upcoming`);
  assert.equal(afterArchive.status, 200);
  const afterBody = await afterArchive.json();
  assert.equal(
    afterBody.events.some((event: { id: string }) => event.id === created.body.event.id),
    false,
    "archived canonical Events must not be publicly listed",
  );
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

test("Category assignment: organizer must use an existing active canonical EventCategory", async () => {
  const { token } = await bootstrapOrganizerOwner("category-assign");
  const categoryName = `EvtApi Category ${ts}`;
  const category = await prisma.eventCategory.create({
    data: { name: categoryName, slug: `evtapi-category-${ts}`, active: true, sortOrder: 1 },
  });
  const { status, body } = await createStandaloneEvent(token, { title: `Categorized ${ts}`, categoryId: category.id });
  assert.equal(status, 201);
  assert.equal(body.event.categoryId, category.id);
  assert.equal(body.event.category.id, category.id);

  const inactive = await prisma.eventCategory.update({ where: { id: category.id }, data: { active: false } });
  assert.equal(inactive.active, false);
  const rejected = await createStandaloneEvent(token, { title: `Inactive Category ${ts}`, categoryId: category.id });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /active Event Category/);

  const arbitrary = await createStandaloneEvent(token, { title: `Arbitrary Category ${ts}`, category: `Not A Real Category ${ts}` });
  assert.equal(arbitrary.status, 400);
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

test("Event PATCH cannot bypass server-authoritative publish readiness", async () => {
  const { token } = await bootstrapOrganizerOwner("patch-bypass");
  const { body: created } = await createStandaloneEvent(token, {
    title: `Incomplete Patch Publish ${ts}`,
    status: "DRAFT",
    visibility: "private",
  });

  const patchResponse = await fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  assert.equal(patchResponse.status, 409);
  const error = await patchResponse.json();
  assert.match(error.error, /POST \/api\/events\/:id\/publish/);

  const persisted = await prisma.event.findUniqueOrThrow({ where: { id: created.event.id } });
  assert.equal(persisted.status, "DRAFT");
  assert.equal(persisted.visibility, "private");
});

test("Event status lifecycle rejects invalid transitions and preserves terminal states", async () => {
  const { token } = await bootstrapOrganizerOwner("status-lifecycle");
  const { body: created } = await createStandaloneEvent(token, {
    title: `Status Lifecycle ${ts}`,
    status: "DRAFT",
    visibility: "private",
  });
  const eventId = created.event.id;

  const draftToCompleted = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  assert.equal(draftToCompleted.status, 409);

  const publish = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publish.status, 400, "incomplete draft must still use the publish readiness gate");

  const directPublished = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  assert.equal(directPublished.status, 409);

  const ready = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      city: "Ahmedabad",
      venue: "Convention Centre",
      startDate: "2027-01-01",
      endDate: "2027-01-02",
    }),
  });
  assert.equal(ready.status, 200);

  const publishReady = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publishReady.status, 200);

  const pause = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "PAUSED" }),
  });
  assert.equal(pause.status, 200);

  const republish = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(republish.status, 200);

  const cancel = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "CANCELLED" }),
  });
  assert.equal(cancel.status, 200);

  const cancelledToDraft = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "DRAFT" }),
  });
  assert.equal(cancelledToDraft.status, 409);

  const finalEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(finalEvent.status, "CANCELLED");
});

test("Event publish readiness: incomplete Event cannot be published and returns missing fields", async () => {
  const { token } = await bootstrapOrganizerOwner("publish-readiness");
  const { body: created } = await createStandaloneEvent(token, { title: `Incomplete ${ts}` });

  const publishRes = await fetch(`${baseUrl}/api/events/${created.event.id}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publishRes.status, 400);
  const body = await publishRes.json();
  assert.ok(Array.isArray(body.missing));
  assert.ok(body.missing.includes("start date"));
  assert.ok(body.missing.includes("end date"));
  assert.ok(body.missing.includes("venue"));
  assert.ok(body.missing.includes("city"));
});

test("Event publish: valid draft transitions to PUBLISHED and public visibility", async () => {
  const { token } = await bootstrapOrganizerOwner("publish");
  const { body: created } = await createStandaloneEvent(token, {
    title: `Ready Event ${ts}`,
    city: "Ahmedabad",
    venue: "Convention Centre",
    startDate: "2027-07-01",
    endDate: "2027-07-02",
  });

  const publishRes = await fetch(`${baseUrl}/api/events/${created.event.id}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publishRes.status, 200);
  const body = await publishRes.json();
  assert.equal(body.event.status, "PUBLISHED");
  assert.equal(body.event.visibility, "public");
});

test("Event publish: cross-organizer caller cannot publish another organizer's Event", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("publish-a");
  const { token: tokenB } = await bootstrapOrganizerOwner("publish-b");
  const { body: created } = await createStandaloneEvent(tokenA, {
    title: `Protected Event ${ts}`,
    city: "Ahmedabad",
    venue: "Convention Centre",
    startDate: "2027-08-01",
    endDate: "2027-08-02",
  });

  const publishRes = await fetch(`${baseUrl}/api/events/${created.event.id}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(publishRes.status, 404);
});


test("Universal public discovery exposes active categories and filters by category", async () => {
  const { token } = await bootstrapOrganizerOwner("public-category");
  const categoryName = `Public Category ${ts}`;
  const category = await prisma.eventCategory.create({
    data: { name: categoryName, slug: `public-category-${ts}`, active: true, sortOrder: 1 },
  });
  const created = await createStandaloneEvent(token, {
    title: `Categorized Public Event ${ts}`,
    city: "Ahmedabad",
    venue: "Category Venue",
    startDate: "2028-01-10",
    endDate: "2028-01-11",
    status: "PUBLISHED",
    visibility: "public",
    categoryId: category.id,
  });
  assert.equal(created.status, 201);

  const categoriesRes = await fetch(`${baseUrl}/api/public/event-categories`);
  assert.equal(categoriesRes.status, 200);
  const categoriesBody = await categoriesRes.json();
  assert.ok(categoriesBody.categories.some((item: { id: string }) => item.id === category.id));

  const filteredRes = await fetch(`${baseUrl}/api/public/events?categoryId=${encodeURIComponent(category.id)}`);
  assert.equal(filteredRes.status, 200);
  const filteredBody = await filteredRes.json();
  assert.equal(filteredBody.events.length, 1);
  assert.equal(filteredBody.events[0].id, created.body.event.id);
});

test("Universal public discovery: only published public non-archived Events are returned", async () => {
  const { token } = await bootstrapOrganizerOwner("public-discovery");
  const ready = await createStandaloneEvent(token, {
    title: `Public Conference ${ts}`,
    city: "Ahmedabad",
    venue: "Public Venue",
    startDate: "2027-09-01",
    endDate: "2027-09-02",
    status: "PUBLISHED",
    visibility: "public",
  });
  assert.equal(ready.status, 201);

  const draft = await createStandaloneEvent(token, {
    title: `Private Draft ${ts}`,
    city: "Ahmedabad",
    venue: "Private Venue",
    status: "DRAFT",
    visibility: "private",
  });
  assert.equal(draft.status, 201);

  const publicRes = await fetch(`${baseUrl}/api/public/events?q=${encodeURIComponent("Public Conference")}&city=Ahmedabad&sort=soonest`);
  assert.equal(publicRes.status, 200);
  const body = await publicRes.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].id, ready.body.event.id);
  assert.equal(body.events[0].eventType, "CONFERENCE");
  assert.equal(body.events[0].organizer.name.startsWith("EvtApi"), true);
});

test("Universal public Event detail: published Event is readable without auth and private Event is hidden", async () => {
  const { token } = await bootstrapOrganizerOwner("public-detail");
  const ready = await createStandaloneEvent(token, {
    title: `Public Detail ${ts}`,
    city: "Ahmedabad",
    venue: "Detail Venue",
    startDate: "2027-10-01",
    endDate: "2027-10-02",
    status: "PUBLISHED",
    visibility: "public",
    modules: ["REGISTRATION", "SESSIONS"],
  });
  const publicRes = await fetch(`${baseUrl}/api/public/events/${ready.body.event.id}`);
  assert.equal(publicRes.status, 200);
  const body = await publicRes.json();
  assert.equal(body.event.id, ready.body.event.id);
  assert.equal(body.event.status, "PUBLISHED");
  assert.equal(body.event.moduleEnablements.length, 2);
  assert.equal(body.linkedExhibitionId, null);

  const hidden = await createStandaloneEvent(token, {
    title: `Hidden Detail ${ts}`,
    status: "DRAFT",
    visibility: "private",
  });
  const hiddenRes = await fetch(`${baseUrl}/api/public/events/${hidden.body.event.id}`);
  assert.equal(hiddenRes.status, 404);
});

test("Universal public Event discovery enforces pagination and validates inverted date ranges", async () => {
  const { token } = await bootstrapOrganizerOwner("public-pagination");
  await createStandaloneEvent(token, {
    title: `Page A ${ts}`,
    city: "Surat",
    venue: "Hall A",
    startDate: "2027-11-01",
    endDate: "2027-11-02",
    status: "PUBLISHED",
  });
  await createStandaloneEvent(token, {
    title: `Page B ${ts}`,
    city: "Surat",
    venue: "Hall B",
    startDate: "2027-12-01",
    endDate: "2027-12-02",
    status: "PUBLISHED",
  });

  const pageRes = await fetch(`${baseUrl}/api/public/events?city=Surat&page=1&limit=1&sort=soonest`);
  assert.equal(pageRes.status, 200);
  const pageBody = await pageRes.json();
  assert.equal(pageBody.page, 1);
  assert.equal(pageBody.pageSize, 1);
  assert.equal(pageBody.events.length, 1);
  assert.ok(pageBody.total >= 2);

  const badRange = await fetch(`${baseUrl}/api/public/events?dateFrom=2027-12-31&dateTo=2027-12-01`);
  assert.equal(badRange.status, 400);
});

test("Second event type: WORKSHOP completes create, module enablement, update, publish, public discovery, and persistence", async () => {
  const { token } = await bootstrapOrganizerOwner("workshop-lifecycle");
  const title = `Workshop Lifecycle ${ts}`;
  const created = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title,
    description: "Hands-on production validation for a non-Exhibition event type.",
    city: "Ahmedabad",
    venue: "Workshop Hall",
    startDate: "2027-07-10",
    endDate: "2027-07-10",
    modules: ["REGISTRATION", "SESSIONS"],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.event.eventType, "WORKSHOP");
  assert.equal(created.body.event.status, "DRAFT");

  const eventId = created.body.event.id as string;
  assert.deepEqual(
    created.body.event.moduleEnablements.map((module: { moduleType: string }) => module.moduleType).sort(),
    ["REGISTRATION", "SESSIONS"],
  );

  const updated = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ description: "Updated workshop description" }),
  });
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  assert.equal(updatedBody.event.eventType, "WORKSHOP");
  assert.equal(updatedBody.event.description, "Updated workshop description");

  const published = await fetch(`${baseUrl}/api/events/${eventId}/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(published.status, 200);
  const publishedBody = await published.json();
  assert.equal(publishedBody.event.eventType, "WORKSHOP");
  assert.equal(publishedBody.event.status, "PUBLISHED");

  const publicRes = await fetch(`${baseUrl}/api/public/events/${eventId}`);
  assert.equal(publicRes.status, 200);
  const publicBody = await publicRes.json();
  assert.equal(publicBody.event.id, eventId);
  assert.equal(publicBody.event.eventType, "WORKSHOP");
  assert.equal(publicBody.event.status, "PUBLISHED");
  assert.equal(publicBody.linkedExhibitionId, null);

  const persisted = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { moduleEnablements: true },
  });
  assert.equal(persisted.eventType, "WORKSHOP");
  assert.equal(persisted.status, "PUBLISHED");
  assert.deepEqual(
    persisted.moduleEnablements.map((module) => module.moduleType).sort(),
    ["REGISTRATION", "SESSIONS"],
  );
});


test("Second event type: WORKSHOP cannot enable the EXHIBITION module", async () => {
  const { token } = await bootstrapOrganizerOwner("workshop-exhibition-module-guard");
  const created = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Workshop Exhibition Guard ${ts}`,
    city: "Ahmedabad",
    venue: "Workshop Hall",
    startDate: "2027-09-10",
    endDate: "2027-09-10",
    modules: ["REGISTRATION"],
  });
  assert.equal(created.status, 201);

  const eventId = created.body.event.id as string;
  const response = await fetch(`${baseUrl}/api/events/${eventId}/modules/EXHIBITION`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 400);

  const persisted = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { moduleEnablements: true },
  });
  assert.equal(persisted.eventType, "WORKSHOP");
  assert.deepEqual(
    persisted.moduleEnablements.map((module) => [module.moduleType, module.enabled]).sort(),
    [["REGISTRATION", true]],
  );
});

test("Second event type: module enablement can be changed without leaking or losing event type", async () => {
  const { token } = await bootstrapOrganizerOwner("workshop-modules");
  const created = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Workshop Modules ${ts}`,
    city: "Ahmedabad",
    venue: "Workshop Hall",
    startDate: "2027-08-10",
    endDate: "2027-08-10",
    modules: ["REGISTRATION"],
  });
  assert.equal(created.status, 201);

  const eventId = created.body.event.id as string;
  const enableSessions = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableSessions.status, 200);
  const moduleBody = await enableSessions.json();
  assert.equal(moduleBody.module.moduleType, "SESSIONS");
  assert.equal(moduleBody.module.enabled, true);

  const disableRegistration = await fetch(`${baseUrl}/api/events/${eventId}/modules/REGISTRATION`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disableRegistration.status, 200);
  const disabledBody = await disableRegistration.json();
  assert.equal(disabledBody.module.moduleType, "REGISTRATION");
  assert.equal(disabledBody.module.enabled, false);

  const persisted = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { moduleEnablements: true },
  });
  assert.equal(persisted.eventType, "WORKSHOP");
  assert.deepEqual(
    persisted.moduleEnablements.map((module) => module.moduleType).sort(),
    ["REGISTRATION", "SESSIONS"],
  );
});


test("Event module mutation: caller without event:update cannot change another organizer's module", async () => {
  const owner = await bootstrapOrganizerOwner("module-perm-owner");
  const { token: scannerToken, userId: scannerUserId } = await signup("module-perm-scanner");
  await prisma.organizerMembership.create({
    data: {
      organizerId: owner.organizerId,
      userId: scannerUserId,
      role: "scanner",
      status: "active",
    },
  });

  const { body: created } = await createStandaloneEvent(owner.token, {
    eventType: "WORKSHOP",
    title: `Module Permission Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const readRes = await fetch(`${baseUrl}/api/events/${eventId}/modules`, {
    headers: { Authorization: `Bearer ${scannerToken}` },
  });
  assert.equal(readRes.status, 200);
  const readBody = await readRes.json();
  assert.equal(readBody.modules[0].enabled, true);

  const mutateRes = await fetch(`${baseUrl}/api/events/${eventId}/modules/REGISTRATION`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${scannerToken}` },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(mutateRes.status, 404);

  const persisted = await prisma.eventModuleEnablement.findUniqueOrThrow({
    where: { eventId_moduleType: { eventId, moduleType: "REGISTRATION" } },
  });
  assert.equal(persisted.enabled, true, "unauthorized module mutation must not change persisted state");
});


test("Event module config: invalid config is rejected and valid empty config persists", async () => {
  const { token } = await bootstrapOrganizerOwner("module-config-validation");
  const created = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Workshop Module Config ${ts}`,
    modules: ["SESSIONS"],
  });
  assert.equal(created.status, 201);
  const eventId = created.body.event.id as string;

  const invalid = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true, config: { unsupported: true } }),
  });
  assert.equal(invalid.status, 400);

  const persistedAfterInvalid = await prisma.eventModuleEnablement.findUniqueOrThrow({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
  });
  assert.equal(persistedAfterInvalid.config, null, "invalid config must not mutate the pre-existing null config");

  const valid = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true, config: {} }),
  });
  assert.equal(valid.status, 200);
  const validBody = await valid.json();
  assert.equal(validBody.module.moduleType, "SESSIONS");
  assert.equal(validBody.module.enabled, true);
  assert.deepEqual(validBody.module.config, {});
});


test("Event module mutation: organizer B cannot mutate organizer A's module", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("module-cross-a");
  const { token: tokenB } = await bootstrapOrganizerOwner("module-cross-b");
  const { body: created } = await createStandaloneEvent(tokenA, {
    eventType: "WORKSHOP",
    title: `Cross Organizer Module Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const mutateRes = await fetch(`${baseUrl}/api/events/${eventId}/modules/REGISTRATION`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(mutateRes.status, 404);

  const persisted = await prisma.eventModuleEnablement.findUniqueOrThrow({
    where: { eventId_moduleType: { eventId, moduleType: "REGISTRATION" } },
  });
  assert.equal(persisted.enabled, true);
});


test("Event module read: organizer B cannot read organizer A's module", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("module-read-cross-a");
  const { token: tokenB } = await bootstrapOrganizerOwner("module-read-cross-b");
  const { body: created } = await createStandaloneEvent(tokenA, {
    eventType: "WORKSHOP",
    title: `Cross Organizer Module Read Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const readRes = await fetch(`${baseUrl}/api/events/${eventId}/modules`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.equal(readRes.status, 404);
});


test("Event module mutation: archived event cannot be changed until restored", async () => {
  const { token } = await bootstrapOrganizerOwner("module-archive");
  const { body: created } = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Archived Module Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const deleteRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteRes.status, 204);

  const mutateRes = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(mutateRes.status, 409);

  const persisted = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
  });
  assert.equal(persisted, null, "archived module mutation must not create a new enablement");

  const existing = await prisma.eventModuleEnablement.findUniqueOrThrow({
    where: { eventId_moduleType: { eventId, moduleType: "REGISTRATION" } },
  });
  assert.equal(existing.enabled, true);
});


test("Event module mutation: restored event can be changed again", async () => {
  const { token } = await bootstrapOrganizerOwner("module-restore");
  const { body: created } = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Restored Module Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  const deleteRes = await fetch(`${baseUrl}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(deleteRes.status, 204);

  const restoreRes = await fetch(`${baseUrl}/api/events/${eventId}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(restoreRes.status, 200);

  const mutateRes = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(mutateRes.status, 200);

  const persisted = await prisma.eventModuleEnablement.findUniqueOrThrow({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
  });
  assert.equal(persisted.enabled, true);
});


test("Event module mutation: rate limit blocks sustained mutation bursts", async () => {
  const { token } = await bootstrapOrganizerOwner("module-rate-limit");
  const { body: created } = await createStandaloneEvent(token, {
    eventType: "WORKSHOP",
    title: `Module Rate Limit Target ${ts}`,
    modules: ["REGISTRATION"],
  });
  const eventId = created.event.id as string;

  let throttled = false;
  for (let i = 0; i < 30; i += 1) {
    const response = await fetch(`${baseUrl}/api/events/${eventId}/modules/SESSIONS`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Test-Rate-Limit-Key": `event-module-rate-limit-${ts}`,
      },
      body: JSON.stringify({ enabled: i % 2 === 0 }),
    });
    if (response.status === 429) {
      throttled = true;
      break;
    }
    assert.ok([200, 400].includes(response.status), `unexpected response status: ${response.status}`);
  }

  assert.equal(throttled, true, "sustained module mutations must eventually be rate limited");
});
