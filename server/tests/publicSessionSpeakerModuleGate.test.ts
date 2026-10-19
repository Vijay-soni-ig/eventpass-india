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

test("public session API respects SPEAKERS and PARTICIPANTS module gates", async () => {
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
      moduleEnablements: { create: [{ moduleType: "SESSIONS", enabled: true }, { moduleType: "PARTICIPANTS", enabled: true }, { moduleType: "SPEAKERS", enabled: false }] },
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

  // Participant schedules must be hidden when SESSIONS is disabled, even if
  // PARTICIPANTS remains enabled. The gate is server-side, not just a UI toggle.
  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
    data: { enabled: false },
  });
  const disabledSchedule = await fetch(
    `${baseUrl}/api/public/events/${eventId}/participants/${participantId}/sessions`,
  );
  assert.equal(disabledSchedule.status, 404, "participant schedule must be hidden when SESSIONS is disabled");

  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
    data: { enabled: true },
  });

  // A speaker-specific schedule must also be hidden while SPEAKERS is disabled,
  // even when PARTICIPANTS and SESSIONS are enabled.
  const disabledSpeakerSchedule = await fetch(
    `${baseUrl}/api/public/events/${eventId}/participants/${participantId}/sessions`,
  );
  assert.equal(disabledSpeakerSchedule.status, 404, "speaker schedule must be hidden when SPEAKERS is disabled");

  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "SPEAKERS" } },
    data: { enabled: true },
  });
  const enabledSchedule = await fetch(
    `${baseUrl}/api/public/events/${eventId}/participants/${participantId}/sessions`,
  );
  assert.equal(enabledSchedule.status, 200);
  const scheduleBody = await enabledSchedule.json();
  assert.ok(scheduleBody.sessions.some((item: { id: string }) => item.id === sessionId));

  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "SPEAKERS" } },
    data: { enabled: false },
  });
  const response = await fetch(`${baseUrl}/api/public/events/${eventId}/sessions`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 1);
  assert.deepEqual(body.sessions[0].speakers, [], "speaker details must be hidden when SPEAKERS is disabled");

  // SPEAKERS is a child directory of PARTICIPANTS. A direct public session
  // request must not leak speaker profile data if PARTICIPANTS is disabled.
  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "SPEAKERS" } },
    data: { enabled: true },
  });
  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    data: { enabled: false },
  });
  const participantsDisabledResponse = await fetch(`${baseUrl}/api/public/events/${eventId}/sessions`);
  assert.equal(participantsDisabledResponse.status, 200, "published sessions remain available when only PARTICIPANTS is disabled");
  const participantsDisabledBody = await participantsDisabledResponse.json();
  assert.equal(participantsDisabledBody.sessions.length, 1);
  assert.deepEqual(
    participantsDisabledBody.sessions[0].speakers,
    [],
    "speaker profile data must be hidden when PARTICIPANTS is disabled even if SPEAKERS is enabled",
  );
});
