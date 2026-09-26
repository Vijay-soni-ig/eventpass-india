import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap() {
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "avm12c-" + ts },
    body: JSON.stringify({ email: "avm12c-" + ts + "@example.com", password: "TestPassword123!", fullName: "AVM12C Test", userType: "exhibitor" }),
  });
  const body = await signup.json();
  assert.equal(signup.status, 201);
  const exhibition = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + body.token },
    body: JSON.stringify({ name: "AVM12C Bootstrap " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

test("AVM-12C public Event can consume its Venue published map only when Floor Plan is enabled", async () => {
  const token = await bootstrap();

  const venueResponse = await fetch(baseUrl + "/api/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "AVM12C Venue " + ts, city: "Ahmedabad" }),
  });
  assert.equal(venueResponse.status, 201);
  const venueId = (await venueResponse.json()).venue.id as string;

  const mapResponse = await fetch(baseUrl + "/api/venue-maps/venues/" + venueId + "/maps", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Main Public Map", canvasWidth: 1200, canvasHeight: 800 }),
  });
  assert.equal(mapResponse.status, 201);
  const map = (await mapResponse.json()).map;

  const publishMap = await fetch(baseUrl + "/api/venue-maps/maps/" + map.id + "/publish", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(publishMap.status, 200);

  const eventResponse = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ eventType: "CONFERENCE", title: "AVM12C Event " + ts, startDate: "2026-10-10", endDate: "2026-10-11", venue: "Legacy Venue", city: "Ahmedabad", venueId, modules: ["FLOOR_PLAN"] }),
  });
  assert.equal(eventResponse.status, 201);
  const event = (await eventResponse.json()).event;

  const publishEvent = await fetch(baseUrl + "/api/events/" + event.id + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
  assert.equal(publishEvent.status, 200);

  const publicMap = await fetch(baseUrl + "/api/public/events/" + event.id + "/venue-maps");
  assert.equal(publicMap.status, 200);
  const payload = await publicMap.json();
  assert.equal(payload.venue.id, venueId);
  assert.equal(payload.maps.length, 1);
  assert.equal(payload.maps[0].id, map.id);
  assert.equal(payload.maps[0].status, undefined);

  const disabledEventResponse = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ eventType: "CONFERENCE", title: "AVM12C Disabled " + ts, startDate: "2026-11-10", endDate: "2026-11-11", venue: "Legacy Venue", city: "Ahmedabad", venueId }),
  });
  assert.equal(disabledEventResponse.status, 201);
  const disabledEvent = (await disabledEventResponse.json()).event;
  const disabledPublish = await fetch(baseUrl + "/api/events/" + disabledEvent.id + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
  assert.equal(disabledPublish.status, 200);
  const disabledMap = await fetch(baseUrl + "/api/public/events/" + disabledEvent.id + "/venue-maps");
  assert.equal(disabledMap.status, 404);
}