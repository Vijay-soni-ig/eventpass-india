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

async function signup() {
  const email = `participant-activity-isolation-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": email },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Participant Activity Isolation",
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).token as string;
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Activity Isolation ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Isolation Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).event.id as string;
}

test("participant activity remains event-scoped for the same organizer", async () => {
  const token = await signup();
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventA, participantType: "SPEAKER", name: "Event A Speaker", isPublic: true },
  });

  const audit = await prisma.auditLog.create({
    data: {
      action: "eventParticipant.test",
      entityType: "EventParticipant",
      entityId: participant.id,
      metadata: { eventId: eventA, participantId: participant.id },
    },
  });

  const res = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/activity`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(res.status, 404, "activity must not cross event boundaries");

  const eventARes = await fetch(
    `${baseUrl}/api/events/${eventA}/participants/${participant.id}/activity`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(eventARes.status, 200);
  const body = await eventARes.json();
  assert.ok(body.items.some((item: { id: string }) => item.id === audit.id));
});
