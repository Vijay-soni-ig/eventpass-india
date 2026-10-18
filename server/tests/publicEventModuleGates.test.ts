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

async function setModule(moduleType: "SPONSORS" | "PARTNERS" | "VENDORS", enabled: boolean) {
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
});
