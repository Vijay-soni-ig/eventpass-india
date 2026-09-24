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
