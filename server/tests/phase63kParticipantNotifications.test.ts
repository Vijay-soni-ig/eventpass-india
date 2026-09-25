import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

test("6.3K participant notifications: lifecycle intent is created idempotently", async () => {
  const auth = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-notification-${ts}` },
    body: JSON.stringify({
      email: `participant-notification-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Participant Notification Organizer",
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
      title: `Participant Notification Event ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Notification Hall",
      startDate: "2027-12-01",
      endDate: "2027-12-02",
      modules: ["PARTICIPANTS", "ANALYTICS"],
    }),
  });
  assert.equal(eventRes.status, 201);
  const { event } = await eventRes.json();

  const create = await fetch(`${baseUrl}/api/events/${event.id}/participants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      participantType: "SPEAKER",
      name: "Asha Sharma",
      title: "Design Lead",
      organization: "Acme Labs",
      isPublic: true,
    }),
  });
  assert.equal(create.status, 201);
  const { participant } = await create.json();

  const intents = await prisma.$queryRaw<Array<{ event_type: string; entity_id: string; status: string }>>`
    SELECT event_type, entity_id, status
    FROM notification_intents
    WHERE idempotency_key = ${"participant-created:" + participant.id}
  `;
  assert.equal(intents.length, 1);
  assert.equal(intents[0].event_type, "PARTICIPANT_CREATED");
  assert.equal(intents[0].entity_id, event.id);
  assert.equal(intents[0].status, "PENDING");

  const duplicate = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM notification_intents
    WHERE idempotency_key = ${"participant-created:" + participant.id}
  `;
  assert.equal(Number(duplicate[0].count), 1);
});
