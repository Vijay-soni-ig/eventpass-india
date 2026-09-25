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

async function signup(label: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `participant-event-isolation-${label}`,
    },
    body: JSON.stringify({
      email: `participant-event-isolation-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Participant Event Isolation ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Isolation ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Isolation Hall",
      startDate: "2027-10-01",
      endDate: "2027-10-02",
      modules: ["PARTICIPANTS", "SPONSORS", "PARTNERS"],
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).event.id as string;
}

test("participant child resources remain event-scoped for the same organizer", async () => {
  const { token } = await signup("same-organizer");
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: {
      eventId: eventA,
      participantType: "SPEAKER",
      name: "Event A Speaker",
      isPublic: true,
    },
  });

  const headers = { Authorization: `Bearer ${token}` };

  const contacts = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/contacts`,
    { headers },
  );
  assert.equal(contacts.status, 404, "contacts must not cross event boundaries");

  const media = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media`,
    { headers },
  );
  assert.equal(media.status, 404, "media must not cross event boundaries");

  const documents = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents`,
    { headers },
  );
  assert.equal(documents.status, 404, "documents must not cross event boundaries");

  const activity = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/activity`,
    { headers },
  );
  assert.equal(activity.status, 404, "activity must not cross event boundaries");
});
