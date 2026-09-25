import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

test("6.3J participant analytics: returns scoped counts and coverage", async () => {
  const auth = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-analytics-${ts}` },
    body: JSON.stringify({
      email: `participant-analytics-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Participant Analytics Organizer",
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
      title: `Participant Analytics Event ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Analytics Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTICIPANTS", "ANALYTICS"],
    }),
  });
  assert.equal(eventRes.status, 201);
  const { event } = await eventRes.json();

  const [speaker, sponsor, staff] = await prisma.eventParticipant.createManyAndReturn({
    data: [
      {
        eventId: event.id,
        participantType: "SPEAKER",
        name: "Asha Sharma",
        title: "Design Lead",
        organization: "Acme Labs",
        bio: "Design speaker",
        email: "asha@example.com",
        photoUrl: "https://example.com/asha.jpg",
        isPublic: true,
      },
      {
        eventId: event.id,
        participantType: "SPONSOR",
        name: "Acme Sponsor",
        organization: "Acme Labs",
        isPublic: true,
      },
      {
        eventId: event.id,
        participantType: "STAFF",
        name: "Internal Staff",
        isPublic: false,
        status: "ACTIVE",
      },
    ],
  });

  await prisma.eventParticipantMedia.create({
    data: {
      participantId: speaker.id,
      kind: "PROFILE_IMAGE",
      fileUrl: "https://example.com/asha.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1234,
      active: true,
    },
  });
  await prisma.eventParticipantContact.create({
    data: {
      eventId: event.id,
      participantId: speaker.id,
      name: "Asha Contact",
      email: "contact@example.com",
      isPrimary: true,
    },
  });
  await prisma.eventParticipantDocument.create({
    data: {
      participantId: speaker.id,
      name: "Speaker Agreement",
      kind: "AGREEMENT",
      fileUrl: "https://example.com/agreement.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 2048,
    },
  });

  const response = await fetch(`${baseUrl}/api/organizer/event-analytics/${event.id}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.participants.total, 3);
  assert.equal(body.participants.active, 3);
  assert.equal(body.participants.public, 2);
  assert.equal(body.participants.private, 1);
  assert.equal(body.participants.byType.SPEAKER, 1);
  assert.equal(body.participants.byType.SPONSOR, 1);
  assert.equal(body.participants.byType.STAFF, 1);
  assert.equal(body.profileCompleteness.complete, 1);
  assert.equal(body.profileCompleteness.rate, 33.33);
  assert.equal(body.engagement.media, 1);
  assert.equal(body.engagement.documents, 1);
  assert.equal(body.engagement.contacts, 1);

  const invalid = await fetch(`${baseUrl}/api/organizer/event-analytics/not-a-uuid/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(invalid.status, 400);

  void sponsor;
  void staff;
});
