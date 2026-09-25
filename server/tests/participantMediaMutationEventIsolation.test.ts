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
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `participant-media-isolation-${ts}`,
    },
    body: JSON.stringify({
      email: `participant-media-isolation-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Participant Media Isolation",
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
      title: `Participant Media Isolation ${label} ${ts}`,
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

test("participant media mutations remain event-scoped for the same organizer", async () => {
  const token = await signup();
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

  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "GALLERY",
      visibility: "PUBLIC",
      fileUrl: "/uploads/participant-media-public/event-a-gallery.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024,
      caption: "Event A Media",
      altText: "Event A media",
      sortOrder: 0,
      uploadedByUserId: (await prisma.user.findFirstOrThrow({ where: { email: `participant-media-isolation-${ts}@example.com` } })).id,
    },
  });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const update = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/${media.id}`,
    { method: "PATCH", headers, body: JSON.stringify({ caption: "Cross Event Update" }) },
  );
  assert.equal(update.status, 404, "media update must not cross event boundaries");

  const remove = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/${media.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(remove.status, 404, "media deletion must not cross event boundaries");

  const reorder = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/reorder`,
    { method: "PATCH", headers, body: JSON.stringify({ items: [{ id: media.id, sortOrder: 10 }] }) },
  );
  assert.equal(reorder.status, 404, "media reorder must not cross event boundaries");

  const unchanged = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.equal(unchanged.caption, "Event A Media");
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.sortOrder, 0);
});
