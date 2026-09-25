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
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-document-isolation-${ts}` },
    body: JSON.stringify({
      email: `participant-document-isolation-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Participant Document Isolation",
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string, userId: (await prisma.user.findFirstOrThrow({ where: { email: `participant-document-isolation-${ts}@example.com` } })).id };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Document Isolation ${label} ${ts}`,
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

test("participant document mutations remain event-scoped for the same organizer", async () => {
  const { token, userId } = await signup();
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventA, participantType: "SPEAKER", name: "Event A Speaker", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Event A Agreement",
      kind: "AGREEMENT",
      description: "Event A document",
      fileUrl: "private://participant-documents/event-a-agreement.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      uploadedByUserId: userId,
    },
  });

  const headers = { Authorization: `Bearer ${token}` };

  const download = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}/download`,
    { headers },
  );
  assert.equal(download.status, 404, "document download must not cross event boundaries");

  const remove = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}`,
    { method: "DELETE", headers },
  );
  assert.equal(remove.status, 404, "document deletion must not cross event boundaries");

  const restore = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}/restore`,
    { method: "POST", headers },
  );
  assert.equal(restore.status, 404, "document restore must not cross event boundaries");

  const unchanged = await prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.name, "Event A Agreement");
});
