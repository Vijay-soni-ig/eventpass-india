// AVM-12 Event <-> Venue integration regression tests
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const r = await fetch(\`\${baseUrl}/api/auth/signup\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": \`avm12-\${label}\` },
    body: JSON.stringify({
      email: \`avm12-\${label}-\${ts}@example.com\`,
      password: "TestPassword123!",
      fullName: \`AVM12 \${label}\`,
      userType: "exhibitor",
    }),
  });
  const body = await r.json();
  assert.equal(r.status, 201);
  const exhibition = await fetch(\`\${baseUrl}/api/exhibitions\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${body.token}\` },
    body: JSON.stringify({ name: \`AVM12 bootstrap \${label} \${ts}\`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

async function createVenue(token: string, label: string) {
  const r = await fetch(\`\${baseUrl}/api/venues\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({ name: \`AVM12 Venue \${label} \${ts}\` }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).venue.id as string;
}

test("AVM-12 non-Exhibition Event can reference an organizer-owned Venue", async () => {
  const token = await bootstrap("event");
  const venueId = await createVenue(token, "event");

  const create = await fetch(\`\${baseUrl}/api/events\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "AVM12 Conference",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Legacy venue text",
      city: "Ahmedabad",
      venueId,
    }),
  });
  assert.equal(create.status, 201);
  const event = (await create.json()).event;
  assert.equal(event.venueId, venueId);
  assert.equal(event.venue.id, venueId);

  const update = await fetch(\`\${baseUrl}/api/events/\${event.id}\`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({ venueId: null }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).event.venueId, null);
});

test("AVM-12 Exhibition Venue selection is propagated to its paired Event", async () => {
  const token = await bootstrap("exhibition");
  const venueId = await createVenue(token, "exhibition");

  const create = await fetch(\`\${baseUrl}/api/exhibitions\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({
      name: "AVM12 Exhibition",
      venue: "Legacy venue text",
      city: "Ahmedabad",
      venueId,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(create.status, 201);
  const exhibition = (await create.json()).exhibition;
  assert.ok(exhibition.eventId);

  const read = await fetch(\`\${baseUrl}/api/events/\${exhibition.eventId}\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).event.venueId, venueId);

  const venue2 = await createVenue(token, "exhibition-2");
  const update = await fetch(\`\${baseUrl}/api/exhibitions/\${exhibition.id}\`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` },
    body: JSON.stringify({ venueId: venue2 }),
  });
  assert.equal(update.status, 200);

  const readUpdated = await fetch(\`\${baseUrl}/api/events/\${exhibition.eventId}\`, {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  assert.equal(readUpdated.status, 200);
  assert.equal((await readUpdated.json()).event.venueId, venue2);
});

test("AVM-12 cross-tenant Venue assignment is rejected", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const foreignVenueId = await createVenue(owner, "foreign");

  const create = await fetch(\`\${baseUrl}/api/events\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${other}\` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "Cross Tenant Event",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Legacy venue text",
      city: "Ahmedabad",
      venueId: foreignVenueId,
    }),
  });
  assert.equal(create.status, 400);
  assert.match((await create.json()).error, /active Venue owned by this organizer/);
});
