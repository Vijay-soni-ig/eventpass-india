import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function signup(label: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-activity-${label}` },
    body: JSON.stringify({
      email: `participant-activity-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Participant Activity ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Activity Event ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Activity Hall",
      startDate: "2027-09-01",
      endDate: "2027-09-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(eventRes.status, 201);
  const eventBody = await eventRes.json();
  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventBody.event.id, participantType: "SPEAKER", name: `Speaker ${label}`, isPublic: true },
  });
  return { token, eventId: eventBody.event.id as string, participantId: participant.id };
}

test("6.3H participant activity: returns participant audit timeline with actor and pagination", async () => {
  const ctx = await bootstrap("timeline");

  const createContact = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ name: "Timeline Contact", email: "timeline@example.com", isPrimary: true }),
  });
  assert.equal(createContact.status, 201);

  const activity = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/activity?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(activity.status, 200);
  const body = await activity.json();
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 10);
  assert.equal(body.total >= 1, true);
  assert.equal(Array.isArray(body.items), true);
  assert.equal(body.items.some((item: { action: string }) => item.action === "eventParticipantContact.created"), true);
  const item = body.items.find((entry: { action: string }) => entry.action === "eventParticipantContact.created");
  assert.equal(item.actorUser?.email?.includes("@example.com"), true);
  assert.equal(item.metadata.participantId, ctx.participantId);

  const filtered = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/activity?action=eventParticipantContact.created&limit=1`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(filtered.status, 200);
  const filteredBody = await filtered.json();
  assert.equal(filteredBody.items.length, 1);
  assert.equal(filteredBody.items[0].action, "eventParticipantContact.created");
});

test("6.3H participant activity: blocks cross-organizer access", async () => {
  const ctx = await bootstrap("isolation");
  const other = await signup("other");
  const response = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/activity`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(response.status, 404);
});

test("6.3H participant activity: validates pagination", async () => {
  const ctx = await bootstrap("validation");
  const response = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/activity?page=0&limit=101`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(response.status, 400);
});
