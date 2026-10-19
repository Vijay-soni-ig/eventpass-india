import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => {
  try {
    await prisma.event.deleteMany({ where: { title: { startsWith: `Disabled participant child routes ${ts}` } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `participant-disabled-${ts}-` } } });
  } finally {
    await stop();
  }
});

test("participant child APIs reject direct access when PARTICIPANTS is disabled", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `participant-disabled-${ts}`,
    },
    body: JSON.stringify({
      email: `participant-disabled-${ts}-organizer@example.com`,
      password: "TestPassword123!",
      fullName: "Disabled Participant Module Test",
      userType: "organizer",
    }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json();

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Disabled participant child routes ${ts}`,
      status: "DRAFT",
      visibility: "private",
      modules: [],
    }),
  });
  assert.equal(eventResponse.status, 201);
  const { event } = await eventResponse.json();

  const participant = await prisma.eventParticipant.create({
    data: {
      eventId: event.id,
      participantType: "SPEAKER",
      name: "Disabled module fixture",
      isPublic: false,
    },
  });

  const base = `${baseUrl}/api/events/${event.id}/participants/${participant.id}`;
  const headers = { Authorization: `Bearer ${token}` };

  for (const resource of ["contacts", "documents", "media", "activity"]) {
    const response = await fetch(`${base}/${resource}`, { headers });
    assert.equal(response.status, 409, `${resource} read must be blocked when PARTICIPANTS is disabled`);
  }

  const contactCreate = await fetch(`${base}/contacts`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Must not be created" }),
  });
  assert.equal(contactCreate.status, 409, "contact mutations must be blocked when PARTICIPANTS is disabled");

  const documentUpload = await fetch(`${base}/documents`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(documentUpload.status, 409, "document uploads must be blocked before upload processing");

  const mediaUpload = await fetch(`${base}/media`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(mediaUpload.status, 409, "media uploads must be blocked before upload processing");

  const [contactCount, documentCount, mediaCount] = await Promise.all([
    prisma.eventParticipantContact.count({ where: { participantId: participant.id } }),
    prisma.eventParticipantDocument.count({ where: { participantId: participant.id } }),
    prisma.eventParticipantMedia.count({ where: { participantId: participant.id } }),
  ]);
  assert.equal(contactCount, 0);
  assert.equal(documentCount, 0);
  assert.equal(mediaCount, 0);
});
