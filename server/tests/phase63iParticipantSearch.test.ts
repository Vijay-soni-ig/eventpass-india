import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap() {
  const auth = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-discovery-${ts}` },
    body: JSON.stringify({
      email: `participant-discovery-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Participant Discovery Organizer",
      userType: "organizer",
    }),
  });
  assert.equal(auth.status, 201);
  const { token } = await auth.json();

  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Discovery Event ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Discovery Hall",
      startDate: "2027-10-01",
      endDate: "2027-10-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(eventRes.status, 201);
  const { event } = await eventRes.json();

  await prisma.eventParticipant.createMany({
    data: [
      { eventId: event.id, participantType: "SPEAKER", name: "Asha Sharma", title: "Design Lead", organization: "Acme Labs", bio: "Product design speaker", isPublic: true, sortOrder: 1 },
      { eventId: event.id, participantType: "SPEAKER", name: "Rohan Mehta", title: "Engineering Lead", organization: "Beta Systems", bio: "Engineering speaker", isPublic: true, sortOrder: 2 },
      { eventId: event.id, participantType: "SPONSOR", name: "Acme Sponsor", organization: "Acme Labs", isPublic: true, sortOrder: 3 },
      { eventId: event.id, participantType: "STAFF", name: "Internal Staff", organization: "Acme Labs", isPublic: false, sortOrder: 4 },
    ],
  });

  return event.id as string;
}

test("6.3I public participant discovery: search, type filter, sort and pagination", async () => {
  const eventId = await bootstrap();

  const search = await fetch(`${baseUrl}/api/public/events/${eventId}/participants?q=design&limit=10`);
  assert.equal(search.status, 200);
  const searchBody = await search.json();
  assert.equal(searchBody.total, 1);
  assert.equal(searchBody.participants[0].name, "Asha Sharma");

  const type = await fetch(`${baseUrl}/api/public/events/${eventId}/participants?type=SPEAKER&sort=name&page=1&limit=1`);
  assert.equal(type.status, 200);
  const typeBody = await type.json();
  assert.equal(typeBody.total, 2);
  assert.equal(typeBody.pageSize, 1);
  assert.equal(typeBody.hasNextPage, true);
  assert.equal(typeBody.participants[0].name, "Asha Sharma");

  const second = await fetch(`${baseUrl}/api/public/events/${eventId}/participants?type=SPEAKER&sort=name&page=2&limit=1`);
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.participants[0].name, "Rohan Mehta");

  const invalid = await fetch(`${baseUrl}/api/public/events/${eventId}/participants?sort=invalid`);
  assert.equal(invalid.status, 400);
});

test("6.3I public participant discovery: never exposes internal staff", async () => {
  const eventId = await bootstrap();
  const response = await fetch(`${baseUrl}/api/public/events/${eventId}/participants?limit=100`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participants.some((participant: { participantType: string }) => participant.participantType === "STAFF"), false);
});
