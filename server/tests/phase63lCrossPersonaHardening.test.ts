import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

async function signup(email: string, fullName: string) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": email },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName, userType: "organizer" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token as string;
}

async function createEvent(token: string, title: string) {
  const response = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Cross Persona Hall",
      startDate: "2027-12-10",
      endDate: "2027-12-11",
      modules: ["PARTICIPANTS", "ANALYTICS"],
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).event;
}

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

test("6.3L cross-persona hardening: organizer isolation, participant lifecycle, and DB consistency", async () => {
  const organizerAToken = await signup(`phase63l-a-${ts}@example.com`, "Organizer A");
  const organizerBToken = await signup(`phase63l-b-${ts}@example.com`, "Organizer B");
  const event = await createEvent(organizerAToken, `Phase 6.3L Event ${ts}`);

  const create = await fetch(`${baseUrl}/api/events/${event.id}/participants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerAToken}` },
    body: JSON.stringify({
      participantType: "SPEAKER",
      name: "Cross Persona Speaker",
      title: "Design Lead",
      organization: "ExhibitTix Labs",
      email: "speaker@example.com",
      isPublic: true,
    }),
  });
  assert.equal(create.status, 201);
  const { participant } = await create.json();

  const denied = await fetch(`${baseUrl}/api/events/${event.id}/participants`, {
    headers: { Authorization: `Bearer ${organizerBToken}` },
  });
  assert.equal(denied.status, 404);

  const publicStaff = await fetch(`${baseUrl}/api/events/${event.id}/participants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerAToken}` },
    body: JSON.stringify({ participantType: "STAFF", name: "Private Staff", isPublic: true }),
  });
  assert.equal(publicStaff.status, 400);

  const update = await fetch(`${baseUrl}/api/events/${event.id}/participants/${participant.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerAToken}` },
    body: JSON.stringify({ title: "Principal Design Lead" }),
  });
  assert.equal(update.status, 200);

  await prisma.eventParticipantContact.create({
    data: {
      eventId: event.id,
      participantId: participant.id,
      name: "Primary Representative",
      designation: "Operations Manager",
      contactType: "PRIMARY",
      email: "rep@example.com",
      isPrimary: true,
    },
  });

  await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "PROFILE_IMAGE",
      visibility: "PUBLIC",
      fileUrl: "https://cdn.example.com/participant.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 2048,
      altText: "Participant portrait",
      sortOrder: 0,
    },
  });

  await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Speaker Profile Agreement",
      kind: "AGREEMENT",
      fileUrl: "https://cdn.example.com/participant.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      uploadedByUserId: (await prisma.user.findFirstOrThrow({ where: { email: `phase63l-a-${ts}@example.com` } })).id,
    },
  });

  const [dbParticipant, contacts, media, documents, intents] = await Promise.all([
    prisma.eventParticipant.findUnique({ where: { id: participant.id } }),
    prisma.eventParticipantContact.count({ where: { participantId: participant.id, archivedAt: null } }),
    prisma.eventParticipantMedia.count({ where: { participantId: participant.id } }),
    prisma.eventParticipantDocument.count({ where: { participantId: participant.id, archivedAt: null } }),
    prisma.$queryRaw<Array<{ event_type: string; idempotency_key: string; status: string }>>`
      SELECT event_type, idempotency_key, status
      FROM notification_intents
      WHERE entity_id = ${event.id}
        AND event_type IN ('PARTICIPANT_CREATED', 'PARTICIPANT_UPDATED')
      ORDER BY created_at ASC
    `,
  ]);

  assert.equal(dbParticipant?.title, "Principal Design Lead");
  assert.equal(dbParticipant?.isPublic, true);
  assert.equal(contacts, 1);
  assert.equal(media, 1);
  assert.equal(documents, 1);
  assert.equal(intents.length, 2);
  assert.deepEqual(intents.map((row) => row.event_type), ["PARTICIPANT_CREATED", "PARTICIPANT_UPDATED"]);
  assert.ok(intents.every((row) => row.status === "PENDING"));
  assert.ok(new Set(intents.map((row) => row.idempotency_key)).size === 2);
});
