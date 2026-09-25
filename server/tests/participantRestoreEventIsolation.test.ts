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
  const email = `participant-restore-isolation-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": email },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Participant Restore Isolation",
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string, userId: (await prisma.user.findFirstOrThrow({ where: { email } })).id };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Restore Isolation ${label} ${ts}`,
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

test("participant child-resource restore remains event-scoped for the same organizer", async () => {
  const { token, userId } = await signup();
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventA, participantType: "SPEAKER", name: "Event A Speaker", isPublic: true },
  });

  const contact = await prisma.eventParticipantContact.create({
    data: {
      eventId: eventA,
      participantId: participant.id,
      name: "Event A Contact",
      email: "event-a@example.com",
      isPrimary: false,
      contactType: "OTHER",
      archivedAt: new Date(),
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
      sortOrder: 0,
      uploadedByUserId: userId,
      archivedAt: new Date(),
      active: false,
    },
  });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const contactRestore = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/contacts/${contact.id}/restore`,
    { method: "POST", headers, body: JSON.stringify({ isPrimary: false }) },
  );
  assert.equal(contactRestore.status, 404, "contact restore must not cross event boundaries");

  const mediaRestore = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/${media.id}/restore`,
    { method: "POST", headers },
  );
  assert.equal(mediaRestore.status, 404, "media restore must not cross event boundaries");

  const unchangedContact = await prisma.eventParticipantContact.findUniqueOrThrow({ where: { id: contact.id } });
  assert.notEqual(unchangedContact.archivedAt, null);

  const unchangedMedia = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.notEqual(unchangedMedia.archivedAt, null);
  assert.equal(unchangedMedia.active, false);
});
