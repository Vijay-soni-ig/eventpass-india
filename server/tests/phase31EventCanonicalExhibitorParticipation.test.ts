import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("exhibitor participation application uses canonical Event lifecycle", async () => {
  const org = await bootstrapOrganizer(baseUrl, "event-canonical-participation", ts);
  organizerIds.push(org.organizerId);

  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: org.firstExhibitionId },
    select: { id: true, eventId: true },
  });
  assert.ok(exhibition.eventId);

  await prisma.event.update({
    where: { id: exhibition.eventId! },
    data: { status: "DRAFT", visibility: "public" },
  });
  await prisma.exhibition.update({
    where: { id: exhibition.id },
    data: { status: "live", visibility: "public" },
  });

  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `phase31-canonical-participation-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Canonical Participation Tester",
      userType: "exhibitor",
    }),
  });
  const signup = await signupResponse.json();
  assert.equal(signupResponse.status, 201, JSON.stringify(signup));

  const blocked = await fetch(`${baseUrl}/api/exhibitor/participations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signup.token}`,
    },
    body: JSON.stringify({ exhibitionId: exhibition.id }),
  });
  assert.equal(blocked.status, 404, "Event DRAFT must block public exhibitor application even if legacy Exhibition is live");

  await prisma.event.update({
    where: { id: exhibition.eventId! },
    data: { status: "PUBLISHED" },
  });

  const applied = await fetch(`${baseUrl}/api/exhibitor/participations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signup.token}`,
    },
    body: JSON.stringify({ exhibitionId: exhibition.id }),
  });
  const appliedBody = await applied.json();
  assert.equal(applied.status, 201, JSON.stringify(appliedBody));
});
