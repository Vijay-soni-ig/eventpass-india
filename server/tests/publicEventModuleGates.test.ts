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

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    if (organizerId) {
      await prisma.organizerMembership.deleteMany({ where: { organizerId } });
      await prisma.organizer.deleteMany({ where: { id: organizerId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await stop();
  }
});

async function setModule(moduleType: "SPONSORS" | "PARTNERS" | "VENDORS" | "PARTICIPANTS" | "SESSIONS" | "SPEAKERS", enabled: boolean) {
  assert.ok(eventId);
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId, moduleType } },
    create: { eventId, moduleType, enabled },
    update: { enabled },
  });
}

test("public participant directories respect each event module enablement", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `public-module-gates-${suffix}@example.com`,
      password: "TestPassword123!",
      fullName: "Public Module Gate Test",
      userType: "organizer",
    }),
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
      title: `Public module gates ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
    },
  });
  eventId = event.id;

  await prisma.eventParticipant.createMany({
    data: [
      { eventId, participantType: "SPONSOR", name: "Visible Sponsor", status: "ACTIVE", isPublic: true },
      { eventId, participantType: "PARTNER", name: "Visible Partner", status: "ACTIVE", isPublic: true },
      { eventId, participantType: "VENDOR", name: "Visible Vendor", status: "ACTIVE", isPublic: true },
      { eventId, participantType: "CUSTOM", customType: "Community", name: "Visible Custom Participant", status: "ACTIVE", isPublic: true },
    ],
  });

  const sponsorsUrl = `${baseUrl}/api/public/events/${eventId}/sponsors`;
  const partnersUrl = `${baseUrl}/api/public/events/${eventId}/partners/specialized`;
  const vendorsUrl = `${baseUrl}/api/public/events/${eventId}/vendors/specialized`;
  const participantsUrl = `${baseUrl}/api/public/events/${eventId}/participants`;

  for (const url of [sponsorsUrl, partnersUrl, vendorsUrl, participantsUrl]) {
    const response = await fetch(url);
    assert.equal(response.status, 404, `disabled modules must not expose public directory data: ${url}`);
  }

  await setModule("SPONSORS", true);
  const sponsorsResponse = await fetch(sponsorsUrl);
  assert.equal(sponsorsResponse.status, 200);
  assert.deepEqual((await sponsorsResponse.json()).sponsors.map((row: { name: string }) => row.name), ["Visible Sponsor"]);
  assert.equal((await fetch(partnersUrl)).status, 404, "enabling SPONSORS must not expose the PARTNERS directory");
  assert.equal((await fetch(vendorsUrl)).status, 404, "enabling SPONSORS must not expose the VENDORS directory");
  const sponsorParticipants = await fetch(participantsUrl);
  assert.equal(sponsorParticipants.status, 200);
  assert.deepEqual((await sponsorParticipants.json()).participants.map((row: { participantType: string }) => row.participantType), ["SPONSOR"]);

  await setModule("SPONSORS", false);
  await setModule("PARTNERS", true);
  const partnersResponse = await fetch(partnersUrl);
  assert.equal(partnersResponse.status, 200);
  assert.deepEqual((await partnersResponse.json()).partners.map((row: { name: string }) => row.name), ["Visible Partner"]);
  assert.equal((await fetch(sponsorsUrl)).status, 404, "disabling SPONSORS must hide its specialized directory");
  assert.equal((await fetch(participantsUrl)).status, 200);
  assert.deepEqual((await (await fetch(participantsUrl)).json()).participants.map((row: { participantType: string }) => row.participantType), ["PARTNER"]);

  await setModule("PARTNERS", false);
  await setModule("VENDORS", true);
  const vendorsResponse = await fetch(vendorsUrl);
  assert.equal(vendorsResponse.status, 200);
  assert.deepEqual((await vendorsResponse.json()).vendors.map((row: { name: string }) => row.name), ["Visible Vendor"]);
  assert.equal((await fetch(partnersUrl)).status, 404, "disabling PARTNERS must hide its specialized directory");
  assert.equal((await fetch(participantsUrl)).status, 200);
  assert.deepEqual((await (await fetch(participantsUrl)).json()).participants.map((row: { participantType: string }) => row.participantType), ["VENDOR"]);

  // Enabling the generic PARTICIPANTS module must not bypass the separate
  // module gates for speakers, sponsors, partners, or vendors.
  await setModule("VENDORS", false);
  await setModule("PARTICIPANTS", true);
  const genericParticipants = await fetch(participantsUrl);
  assert.equal(genericParticipants.status, 200);
  assert.deepEqual(
    (await genericParticipants.json()).participants.map((row: { participantType: string }) => row.participantType),
    ["CUSTOM"],
    "PARTICIPANTS alone must expose only generic/custom participant records",
  );

  await setModule("SPONSORS", true);
  const mixedParticipants = await fetch(participantsUrl);
  assert.equal(mixedParticipants.status, 200);
  assert.deepEqual(
    (await mixedParticipants.json()).participants.map((row: { participantType: string }) => row.participantType).sort(),
    ["CUSTOM", "SPONSOR"],
    "specialized types must be included only when their own module is enabled",
  );
  await setModule("SPONSORS", false);

  // Public schedules must respect both the SESSIONS module and the separate
  // SPEAKERS module. A published schedule must not leak speaker profiles when
  // the event has disabled SPEAKERS.
  const speaker = await prisma.eventParticipant.create({
    data: {
      eventId,
      participantType: "SPEAKER",
      name: "Public Gate Speaker",
      status: "ACTIVE",
      isPublic: true,
    },
  });
  const session = await prisma.eventSession.create({
    data: {
      eventId,
      title: "Public Gate Session",
      date: new Date("2026-10-01T00:00:00.000Z"),
      startTime: "10:00",
      endTime: "11:00",
      status: "PUBLISHED",
    },
  });
  await prisma.eventSessionSpeaker.create({
    data: { sessionId: session.id, participantId: speaker.id, sortOrder: 0 },
  });

  const sessionsUrl = `${baseUrl}/api/public/events/${eventId}/sessions`;
  const participantSessionsUrl = `${baseUrl}/api/public/events/${eventId}/participants/${speaker.id}/sessions`;

  await setModule("VENDORS", false);
  await setModule("SESSIONS", true);
  const sessionsWithoutSpeakers = await fetch(sessionsUrl);
  assert.equal(sessionsWithoutSpeakers.status, 200);
  const sessionsWithoutSpeakersBody = await sessionsWithoutSpeakers.json();
  assert.deepEqual(sessionsWithoutSpeakersBody.sessions.map((row: { speakers: unknown[] }) => row.speakers), [[]],
    "speaker details must remain hidden when SPEAKERS is disabled");
  assert.equal(await fetch(participantSessionsUrl).then((response) => response.status), 404,
    "speaker schedule endpoint must require PARTICIPANTS and SPEAKERS modules too");

  await setModule("PARTICIPANTS", true);
  await setModule("SPEAKERS", true);
  const sessionsWithSpeakers = await fetch(sessionsUrl);
  assert.equal(sessionsWithSpeakers.status, 200);
  const sessionsWithSpeakersBody = await sessionsWithSpeakers.json();
  assert.deepEqual(
    sessionsWithSpeakersBody.sessions.map((row: { speakers: Array<{ participant: { name: string } }> }) =>
      row.speakers.map((entry) => entry.participant.name)),
    [["Public Gate Speaker"]],
  );
  const participantSessions = await fetch(participantSessionsUrl);
  assert.equal(participantSessions.status, 200);
  assert.deepEqual((await participantSessions.json()).sessions.map((row: { id: string }) => row.id), [session.id]);

  await setModule("SESSIONS", false);
  assert.equal(await fetch(sessionsUrl).then((response) => response.status), 404,
    "disabling SESSIONS must hide public schedules");
  assert.equal(await fetch(participantSessionsUrl).then((response) => response.status), 404,
    "disabling SESSIONS must hide speaker schedules");
});
