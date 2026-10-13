import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const suffix = Date.now();
let userId: string | undefined;
let organizerId: string | undefined;
let eventId: string | undefined;
let sessionId: string | undefined;
let participantId: string | undefined;
let sessionSpeakerId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (sessionSpeakerId) await prisma.eventSessionSpeaker.deleteMany({ where: { id: sessionSpeakerId } });
    if (sessionId) await prisma.eventSession.deleteMany({ where: { id: sessionId } });
    if (participantId) await prisma.eventParticipant.deleteMany({ where: { id: participantId } });
    if (eventId) {
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (organizerId) {
      await prisma.organizerMembership.deleteMany({ where: { organizerId } });
      await prisma.organizer.deleteMany({ where: { id: organizerId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await stop();
  }
});

test("public session API does not expose speakers when the SPEAKERS module is disabled", async () => {
  const email = `public-session-module-${suffix}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: "Session Module Test", userType: "organizer" }),
  });
  const signupBody = await signup.json();
  assert.equal(signup.status, 201, JSON.stringify(signupBody));
  userId = signupBody.user.id;

  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId, status: "active" },
    select: { organizerId: true },
  });
  organizerId = membership.organizerId;

  const event = await prisma.event.create({
    data: {
      organizerId,
      ownerId: userId,
      title: `Session module gate ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      moduleEnablements: { create: [{ moduleType: "SESSIONS", enabled: true }, { moduleType: "SPEAKERS", enabled: false }] },
    },
  });
  eventId = event.id;

  const speaker = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Hidden Speaker", status: "ACTIVE", isPublic: true },
  });
  participantId = speaker.id;

  const session = await prisma.eventSession.create({
    data: {
      eventId,
      title: "Public Session",
      date: new Date("2030-01-01T00:00:00.000Z"),
      startTime: "10:00",
      endTime: "11:00",
      status: "PUBLISHED",
    },
  });
  sessionId = session.id;

  const link = await prisma.eventSessionSpeaker.create({
    data: { sessionId, participantId },
  });
  sessionSpeakerId = link.id;

  const response = await fetch(`${baseUrl}/api/public/events/${eventId}/sessions`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 1);
  assert.deepEqual(body.sessions[0].speakers, [], "speaker details must be hidden when SPEAKERS is disabled");
});
