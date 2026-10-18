import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "analytics-isolation-" + label,
    },
    body: JSON.stringify({
      email: "analytics-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Analytics " + label,
      userType: "organizer",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { token: body.token as string, userId: body.user.id as string };
}

test("organizer analytics active count follows canonical Event lifecycle", async () => {
  const owner = await signup("canonical-owner");
  const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: owner.userId, status: "active" } });
  const exhibition = await prisma.exhibition.create({
    data: { ownerId: owner.userId, organizerId: membership.organizerId, name: "Canonical analytics exhibition " + ts, status: "live", visibility: "public" },
  });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId, ownerId: owner.userId, title: "Canonical analytics event " + ts,
      eventType: "EXHIBITION", status: "DRAFT", visibility: "public",
      exhibition: { connect: { id: exhibition.id } },
    },
  });

  const draft = await fetch(baseUrl + "/api/organizer/analytics/dashboard", { headers: { Authorization: "Bearer " + owner.token } });
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).activeExhibitions, 0);

  await prisma.event.update({ where: { id: event.id }, data: { status: "PUBLISHED" } });
  const published = await fetch(baseUrl + "/api/organizer/analytics/dashboard", { headers: { Authorization: "Bearer " + owner.token } });
  assert.equal(published.status, 200);
  assert.equal((await published.json()).activeExhibitions, 1);
});
test("organizer analytics cannot cross tenant boundaries", async () => {
  const owner = await signup("owner");
  const other = await signup("other");

  const ownerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: owner.userId, status: "active" },
  });
  const otherMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: other.userId, status: "active" },
  });
  assert.notEqual(ownerMembership.organizerId, otherMembership.organizerId);

  const exhibition = await prisma.exhibition.create({
    data: {
      ownerId: owner.userId,
      organizerId: ownerMembership.organizerId,
      name: "Analytics isolation " + ts,
      status: "live",
      visibility: "public",
    },
  });

  const event = await prisma.event.create({
    data: {
      organizerId: ownerMembership.organizerId,
      ownerId: owner.userId,
      title: "Analytics event isolation " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
    },
  });

  const dashboard = await fetch(
    baseUrl + "/api/organizer/analytics/dashboard?exhibitionId=" + exhibition.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(dashboard.status, 200);
  const dashboardBody = await dashboard.json();
  assert.equal(dashboardBody.totalExhibitions, 0);
  assert.equal(dashboardBody.totalStalls, 0);
  assert.equal(dashboardBody.totalVisitors, 0);
  assert.equal(dashboardBody.totalLeads, 0);

  const exhibitionDetail = await fetch(
    baseUrl + "/api/organizer/analytics/exhibitions/" + exhibition.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(exhibitionDetail.status, 404);

  const eventAnalytics = await fetch(
    baseUrl + "/api/organizer/event-analytics/" + event.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(eventAnalytics.status, 404);
});


test("participant analytics rejects archived events", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "archived-participant-analytics", ts + 3);
  let eventId: string | undefined;

  try {
    const event = await prisma.event.create({
      data: {
        organizerId: owner.organizerId,
        ownerId: owner.userId,
        title: "Archived participant analytics " + ts,
        eventType: "CONFERENCE",
        status: "DRAFT",
        visibility: "public",
        moduleEnablements: {
          create: [
            { moduleType: "ANALYTICS", enabled: true },
            { moduleType: "PARTICIPANTS", enabled: true },
          ],
        },
      },
    });
    eventId = event.id;

    const beforeArchive = await fetch(
      baseUrl + "/api/organizer/event-analytics/" + event.id + "/participants",
      { headers: { Authorization: "Bearer " + owner.token } },
    );
    assert.equal(beforeArchive.status, 200, await beforeArchive.text());

    const archive = await fetch(baseUrl + "/api/events/" + event.id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + owner.token },
    });
    assert.equal(archive.status, 204, await archive.text());

    const afterArchive = await fetch(
      baseUrl + "/api/organizer/event-analytics/" + event.id + "/participants",
      { headers: { Authorization: "Bearer " + owner.token } },
    );
    assert.equal(afterArchive.status, 404, "archived event analytics must not be accessible");
  } finally {
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    await cleanupOrganizers([owner.organizerId]);
  }
});
