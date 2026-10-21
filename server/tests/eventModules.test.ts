import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";
import { prisma } from "../src/lib/prisma";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

async function signup(label: string) {
  const email = `evtmod-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtMod ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  return { token: res.token as string, userId: res.user.id as string };
}

async function bootstrapOrganizerOwner(label: string) {
  const { token, userId } = await signup(label);
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtMod bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  return { token, userId, organizerId: res.exhibition.organizerId as string };
}

async function createEvent(token: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ eventType: "WORKSHOP", title: `EvtMod Event ${ts}`, status: "DRAFT", visibility: "public", modules: [], ...extra }),
  }).then((r) => r.json());
  return res.event;
}

test("Module list starts empty for a standalone Event with no requested modules", async () => {
  const { token } = await bootstrapOrganizerOwner("list-empty");
  const event = await createEvent(token);
  const res = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.modules, []);
});

test("Module enable: PUT enables a module and it appears in the list", async () => {
  const { token } = await bootstrapOrganizerOwner("enable");
  const event = await createEvent(token);
  const putRes = await fetch(`${baseUrl}/api/events/${event.id}/modules/SPEAKERS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(putRes.status, 200);
  const putBody = await putRes.json();
  assert.equal(putBody.module.moduleType, "SPEAKERS");
  assert.equal(putBody.module.enabled, true);

  const listRes = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${token}` } });
  const listBody = await listRes.json();
  assert.equal(listBody.modules.length, 1);
  assert.equal(listBody.modules[0].moduleType, "SPEAKERS");
});

test("Module disable: PUT with enabled:false toggles an existing enablement off without deleting the row", async () => {
  const { token } = await bootstrapOrganizerOwner("disable");
  const event = await createEvent(token);
  await fetch(`${baseUrl}/api/events/${event.id}/modules/SPONSORS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  const disableRes = await fetch(`${baseUrl}/api/events/${event.id}/modules/SPONSORS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disableRes.status, 200);
  const disableBody = await disableRes.json();
  assert.equal(disableBody.module.enabled, false);

  const listRes = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${token}` } });
  const listBody = await listRes.json();
  assert.equal(listBody.modules.length, 1, "disabling must not delete the row — it stays queryable with enabled:false");
});

test("Module configuration validation: an unrecognized config key is rejected since every module currently uses a strict empty schema", async () => {
  const { token } = await bootstrapOrganizerOwner("config-invalid");
  const event = await createEvent(token);
  const res = await fetch(`${baseUrl}/api/events/${event.id}/modules/VENDORS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true, config: { someUnknownKey: "x" } }),
  });
  assert.equal(res.status, 400);
});

test("Module configuration validation: an empty config object is accepted", async () => {
  const { token } = await bootstrapOrganizerOwner("config-valid");
  const event = await createEvent(token);
  const res = await fetch(`${baseUrl}/api/events/${event.id}/modules/VOLUNTEERS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true, config: {} }),
  });
  assert.equal(res.status, 200);
});

test("Invalid module type in the URL is rejected with 400", async () => {
  const { token } = await bootstrapOrganizerOwner("invalid-type");
  const event = await createEvent(token);
  const res = await fetch(`${baseUrl}/api/events/${event.id}/modules/NOT_A_REAL_MODULE`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 400);
});

test("Unauthorized module modification: cross-organizer PUT is rejected (404, no ownership trust from the eventId path param alone)", async () => {
  const { token: tokenA } = await bootstrapOrganizerOwner("mod-cross-a");
  const { token: tokenB } = await bootstrapOrganizerOwner("mod-cross-b");
  const event = await createEvent(tokenA);

  const res = await fetch(`${baseUrl}/api/events/${event.id}/modules/LEADS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenB}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 404);

  const listAsA = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${tokenA}` } });
  const listBody = await listAsA.json();
  assert.equal(listBody.modules.length, 0, "organizer B's failed attempt must not have enabled anything");
});

test("Unauthenticated module list/modify is rejected", async () => {
  const { token } = await bootstrapOrganizerOwner("mod-unauth");
  const event = await createEvent(token);
  const listRes = await fetch(`${baseUrl}/api/events/${event.id}/modules`);
  assert.equal(listRes.status, 401);
  const putRes = await fetch(`${baseUrl}/api/events/${event.id}/modules/LEADS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(putRes.status, 401);
});


test("Module enforcement blocks direct APIs when the corresponding module is disabled", async () => {
  const { token } = await bootstrapOrganizerOwner("api-gates");
  const event = await createEvent(token);

  const ticketTypes = await fetch(baseUrl + "/api/organizer/event-tickets?eventId=" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(ticketTypes.status, 409);

  const checkIn = await fetch(baseUrl + "/api/event-ticket-check-ins/summary?eventId=" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(checkIn.status, 409);

  const analytics = await fetch(baseUrl + "/api/organizer/event-analytics/" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(analytics.status, 409);

  const partners = await fetch(baseUrl + "/api/events/" + event.id + "/partners", { headers: { Authorization: "Bearer " + token } });
  assert.equal(partners.status, 409);
});


test("Archived events cannot read or modify modules", async () => {
  const { token } = await bootstrapOrganizerOwner("archived-boundary");
  const event = await createEvent(token);
  const archiveRes = await fetch(`${baseUrl}/api/events/${event.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archiveRes.status, 204);
  const listRes = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(listRes.status, 409);
  const putRes = await fetch(`${baseUrl}/api/events/${event.id}/modules/SPEAKERS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(putRes.status, 409);
  const restoreRes = await fetch(`${baseUrl}/api/events/${event.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restoreRes.status, 200);
});

test("View-only organizer roles cannot modify event modules", async () => {
  const { token: ownerToken, organizerId } = await bootstrapOrganizerOwner("view-only");
  const viewer = await signup("view-only-member");
  await prisma.organizerMembership.create({
    data: {
      organizerId,
      userId: viewer.userId,
      invitedEmail: `evtmod-view-only-member-${ts}@example.com`,
      role: "finance",
      status: "active",
    },
  });
  const event = await createEvent(ownerToken);
  const putRes = await fetch(`${baseUrl}/api/events/${event.id}/modules/SPEAKERS`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewer.token}` },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(putRes.status, 404);
  const listRes = await fetch(`${baseUrl}/api/events/${event.id}/modules`, { headers: { Authorization: `Bearer ${viewer.token}` } });
  assert.equal(listRes.status, 200);
});

test("Linked Exhibition events cannot disable required operational modules", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("linked-required");
  const exhibition = await prisma.exhibition.findFirstOrThrow({
    where: { organizerId },
    select: { id: true, eventId: true },
  });
  assert.ok(exhibition.eventId);
  for (const moduleType of ["EXHIBITION", "TICKETING", "EXHIBITORS", "STALL_BOOKING", "FLOOR_PLAN", "LEADS", "CHECK_IN", "ANALYTICS"]) {
    const res = await fetch(`${baseUrl}/api/events/${exhibition.eventId}/modules/${moduleType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(res.status, 409, `linked Exhibition module ${moduleType} must remain required`);
  }
});

test("Duplicate modules in event creation are rejected", async () => {
  const { token } = await bootstrapOrganizerOwner("duplicate-modules");
  const res = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "Duplicate Module Test " + ts,
      modules: ["SPEAKERS", "SPEAKERS"],
    }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /duplicates/);
});


test("Module enforcement covers all organizer-facing Universal Event operational APIs", async () => {
  const { token } = await bootstrapOrganizerOwner("api-gates-complete");
  const event = await createEvent(token);
  const headers = { Authorization: "Bearer " + token };

  const cases = [
    ["/api/organizer/registrations?eventId=" + event.id, 404, "REGISTRATION organizer scope rejects disabled module"],
    ["/api/events/" + event.id + "/speakers", 409, "SPEAKERS"],
    ["/api/events/" + event.id + "/sessions", 409, "SESSIONS"],
    ["/api/events/" + event.id + "/sponsors", 409, "SPONSORS list"],
    ["/api/events/" + event.id + "/sponsor-packages", 409, "SPONSORS package API"],
    ["/api/events/" + event.id + "/sponsors/00000000-0000-4000-8000-000000000001/profile", 409, "SPONSORS profile API"],
    ["/api/events/" + event.id + "/partners", 409, "PARTNERS"],
    ["/api/events/" + event.id + "/vendors", 409, "VENDORS"],
    ["/api/events/" + event.id + "/staff", 409, "PARTICIPANTS staff API"],
    ["/api/events/" + event.id + "/participants", 409, "PARTICIPANTS"],
  ] as const;

  for (const [path, expectedStatus, label] of cases) {
    const res = await fetch(baseUrl + path, { headers });
    assert.equal(res.status, expectedStatus, label);
  }
});


test("Event creation cannot bypass module compatibility rules enforced by the module update API", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("create-module-compatibility");
  const forbiddenModuleCases = [
    { moduleType: "EXHIBITION", expectedMessage: /EXHIBITION module is only available/ },
    { moduleType: "EXHIBITORS", expectedMessage: /not yet supported for standalone Universal Events/ },
    { moduleType: "STALL_BOOKING", expectedMessage: /not yet supported for standalone Universal Events/ },
    { moduleType: "LEADS", expectedMessage: /not yet supported for standalone Universal Events/ },
  ] as const;

  const beforeCount = await prisma.event.count({ where: { organizerId } });
  for (const item of forbiddenModuleCases) {
    const response = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        eventType: "WORKSHOP",
        title: `Rejected ${item.moduleType} module ${ts}`,
        status: "DRAFT",
        visibility: "public",
        modules: [item.moduleType],
      }),
    });
    assert.equal(response.status, 400, `module ${item.moduleType} must be rejected at creation`);
    const body = await response.json();
    assert.match(body.error, item.expectedMessage);
  }

  const afterCount = await prisma.event.count({ where: { organizerId } });
  assert.equal(afterCount, beforeCount, "rejected module configurations must not create Events");
});

test("Disabled SPONSORS module blocks nested mutations without changing sponsor data", async () => {
  const { token, organizerId } = await bootstrapOrganizerOwner("disabled-sponsor-mutations");
  const event = await createEvent(token);
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const missingId = "00000000-0000-4000-8000-000000000001";

  const beforePackages = await prisma.eventSponsorPackage.count({ where: { eventId: event.id } });
  const beforeProfiles = await prisma.eventSponsorProfile.count({ where: { eventId: event.id } });

  const packageMutation = await fetch(
    baseUrl + "/api/events/" + event.id + "/sponsor-packages/" + missingId,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Must not be created", amount: 100 }),
    },
  );
  assert.equal(packageMutation.status, 409, "disabled SPONSORS must block package mutation before resource lookup");
  assert.match((await packageMutation.json()).error, /SPONSORS module is not enabled/);

  const profileMutation = await fetch(
    baseUrl + "/api/events/" + event.id + "/sponsors/" + missingId + "/profile",
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ amountOverride: 100 }),
    },
  );
  assert.equal(profileMutation.status, 409, "disabled SPONSORS must block profile mutation before sponsor lookup");
  assert.match((await profileMutation.json()).error, /SPONSORS module is not enabled/);

  const afterPackages = await prisma.eventSponsorPackage.count({ where: { eventId: event.id } });
  const afterProfiles = await prisma.eventSponsorProfile.count({ where: { eventId: event.id } });
  assert.equal(afterPackages, beforePackages, "blocked requests must not create or modify sponsor packages");
  assert.equal(afterProfiles, beforeProfiles, "blocked requests must not create or modify sponsor profiles");

  const eventAfter = await prisma.event.findUniqueOrThrow({
    where: { id: event.id },
    select: { organizerId: true },
  });
  assert.equal(eventAfter.organizerId, organizerId, "test event ownership remains unchanged");
});


test("Disabled SPONSORS module blocks package create, archive, and restore without changing package data", async () => {
  const { token } = await bootstrapOrganizerOwner("disabled-sponsor-package-crud");
  const event = await createEvent(token);
  const jsonHeaders = { "Content-Type": "application/json", Authorization: "Bearer " + token };

  const enableRes = await fetch(baseUrl + "/api/events/" + event.id + "/modules/SPONSORS", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableRes.status, 200);

  async function createPackage(name: string) {
    const response = await fetch(baseUrl + "/api/events/" + event.id + "/sponsor-packages", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ name, amount: 100 }),
    });
    assert.equal(response.status, 201);
    return (await response.json()).package.id as string;
  }

  const activePackageId = await createPackage("Active package");
  const archivedPackageId = await createPackage("Archived package");
  const archiveBeforeDisable = await fetch(
    baseUrl + "/api/events/" + event.id + "/sponsor-packages/" + archivedPackageId,
    { method: "DELETE", headers: jsonHeaders },
  );
  assert.equal(archiveBeforeDisable.status, 204);

  const disableRes = await fetch(baseUrl + "/api/events/" + event.id + "/modules/SPONSORS", {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disableRes.status, 200);

  const beforePackages = await prisma.eventSponsorPackage.findMany({
    where: { eventId: event.id },
    select: { id: true, status: true },
  });

  const createRes = await fetch(baseUrl + "/api/events/" + event.id + "/sponsor-packages", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "Must not be created", amount: 250 }),
  });
  assert.equal(createRes.status, 409, "disabled SPONSORS must block package creation");

  const archiveRes = await fetch(
    baseUrl + "/api/events/" + event.id + "/sponsor-packages/" + activePackageId,
    { method: "DELETE", headers: jsonHeaders },
  );
  assert.equal(archiveRes.status, 409, "disabled SPONSORS must block package archive");

  const restoreRes = await fetch(
    baseUrl + "/api/events/" + event.id + "/sponsor-packages/" + archivedPackageId + "/restore",
    { method: "POST", headers: jsonHeaders },
  );
  assert.equal(restoreRes.status, 409, "disabled SPONSORS must block package restore");

  const afterPackages = await prisma.eventSponsorPackage.findMany({
    where: { eventId: event.id },
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  assert.equal(afterPackages.length, beforePackages.length, "blocked create must not add a package");
  assert.deepEqual(
    afterPackages.map(({ id, status }) => ({ id, status })).sort((a, b) => a.id.localeCompare(b.id)),
    beforePackages.map(({ id, status }) => ({ id, status })).sort((a, b) => a.id.localeCompare(b.id)),
    "blocked archive and restore must not change existing package statuses",
  );
});

test("Disabled module gates block direct create mutations across module-specific APIs", async () => {
  const { token } = await bootstrapOrganizerOwner("disabled-module-create-mutations");
  const event = await createEvent(token);
  const headers = { "Content-Type": "application/json", Authorization: "Bearer " + token };

  const before = {
    participants: await prisma.eventParticipant.count({ where: { eventId: event.id } }),
    sessions: await prisma.eventSession.count({ where: { eventId: event.id } }),
    sponsorPackages: await prisma.eventSponsorPackage.count({ where: { eventId: event.id } }),
    vendorServices: await prisma.eventVendorService.count({ where: { eventId: event.id } }),
  };

  // Empty bodies intentionally exercise module gates before payload validation.
  // A disabled module must consistently reject direct API writes, not just hide
  // the corresponding dashboard/public read surface.
  const cases = [
    { path: `/api/events/${event.id}/participants`, module: "PARTICIPANTS" },
    { path: `/api/events/${event.id}/staff`, module: "PARTICIPANTS" },
    { path: `/api/events/${event.id}/speakers`, module: "SPEAKERS" },
    { path: `/api/events/${event.id}/sessions`, module: "SESSIONS" },
    { path: `/api/events/${event.id}/sponsors`, module: "SPONSORS" },
    { path: `/api/events/${event.id}/sponsor-packages`, module: "SPONSORS" },
    { path: `/api/events/${event.id}/partners`, module: "PARTNERS" },
    { path: `/api/events/${event.id}/vendors`, module: "VENDORS" },
    { path: `/api/events/${event.id}/vendor-services`, module: "VENDORS" },
  ] as const;

  for (const item of cases) {
    const response = await fetch(baseUrl + item.path, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 409, `${item.module} disabled module must block POST ${item.path}`);
    assert.match((await response.json()).error, new RegExp(item.module));
  }

  const after = {
    participants: await prisma.eventParticipant.count({ where: { eventId: event.id } }),
    sessions: await prisma.eventSession.count({ where: { eventId: event.id } }),
    sponsorPackages: await prisma.eventSponsorPackage.count({ where: { eventId: event.id } }),
    vendorServices: await prisma.eventVendorService.count({ where: { eventId: event.id } }),
  };
  assert.deepEqual(after, before, "disabled-module writes must not create database records");
});
