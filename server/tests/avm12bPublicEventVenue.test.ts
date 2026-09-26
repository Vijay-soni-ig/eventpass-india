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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "avm12b-" + ts },
    body: JSON.stringify({ email: "avm12b-" + ts + "@example.com", password: "TestPassword123!", fullName: "AVM12B Test", userType: "exhibitor" }),
  });
  const body = await signup.json();
  assert.equal(signup.status, 201);
  const exhibition = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + body.token },
    body: JSON.stringify({ name: "AVM12B Bootstrap " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

test("AVM-12B public Event reads expose active canonical Venue and hide archived Venue", async () => {
  const token = await bootstrap();
  const venueResponse = await fetch(baseUrl + "/api/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "AVM12B Venue " + ts, city: "Ahmedabad", state: "Gujarat" }),
  });
  assert.equal(venueResponse.status, 201);
  const venueId = (await venueResponse.json()).venue.id as string;

  const eventResponse = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ eventType: "CONFERENCE", title: "AVM12B Public Event " + ts, description: "AVM12B", startDate: "2026-10-10", endDate: "2026-10-11", venue: "Legacy Venue Text", city: "Ahmedabad", venueId }),
  });
  assert.equal(eventResponse.status, 201);
  const event = (await eventResponse.json()).event;

  const publish = await fetch(baseUrl + "/api/events/" + event.id + "/publish", { method: "POST", headers: { Authorization: "Bearer " + token } });
  assert.equal(publish.status, 200);

  const list = await fetch(baseUrl + "/api/public/events");
  assert.equal(list.status, 200);
  const listed = (await list.json()).events.find((item: { id: string }) => item.id === event.id);
  assert.ok(listed);
  assert.equal(listed.physicalVenue.id, venueId);
  assert.equal(listed.venue, "Legacy Venue Text");

  const detail = await fetch(baseUrl + "/api/public/events/" + event.id);
  assert.equal(detail.status, 200);
  const detailEvent = (await detail.json()).event;
  assert.equal(detailEvent.physicalVenue.id, venueId);

  const archive = await fetch(baseUrl + "/api/venues/" + venueId, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  assert.equal(archive.status, 204);

  const archivedDetail = await fetch(baseUrl + "/api/public/events/" + event.id);
  assert.equal(archivedDetail.status, 200);
  assert.equal((await archivedDetail.json()).event.physicalVenue, null);
});