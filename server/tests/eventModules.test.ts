import assert from "node:assert/strict";
import { test, before, after } from "node:test";
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

  const ticketTypes = await fetch(baseUrl + "/api/event-tickets?eventId=" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(ticketTypes.status, 409);

  const checkIn = await fetch(baseUrl + "/api/event-ticket-check-ins/summary?eventId=" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(checkIn.status, 409);

  const analytics = await fetch(baseUrl + "/api/organizer/event-analytics/" + event.id, { headers: { Authorization: "Bearer " + token } });
  assert.equal(analytics.status, 409);

  const partners = await fetch(baseUrl + "/api/events/" + event.id + "/partners", { headers: { Authorization: "Bearer " + token } });
  assert.equal(partners.status, 409);
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
