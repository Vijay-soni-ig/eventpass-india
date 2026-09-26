import assert from "node:assert/strict";
import { test, before, after } from "node:test";
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
  if (organizerIds.length) {
    await prisma.dashboard.deleteMany({ where: { ownerType: "ORGANIZER", ownerId: { in: organizerIds } } });
  }
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function auth(url: string, token: string, init: RequestInit = {}) {
  return fetch(baseUrl + url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

async function createDashboard(token: string, ownerId: string, widgetType: string) {
  const response = await auth("/api/dashboards", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerType: "ORGANIZER",
      ownerId,
      name: `FD11 ${widgetType} ${Date.now()}`,
      widgets: [{ widgetType }],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.dashboard as { id: string; version: number };
}

test("dashboard APIs enforce organizer tenant isolation and reject cross-tenant event filters", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "fd11-a", ts + 1);
  const orgB = await bootstrapOrganizer(baseUrl, "fd11-b", ts + 2);
  organizerIds.push(orgA.organizerId, orgB.organizerId);

  const dashboard = await createDashboard(orgA.token, orgA.organizerId, "ORGANIZER_REVENUE_KPI");

  const crossTenantRead = await auth(`/api/dashboards/${dashboard.id}`, orgB.token);
  assert.equal(crossTenantRead.status, 403, await crossTenantRead.text());

  const crossTenantData = await auth(`/api/dashboards/${dashboard.id}/data`, orgB.token);
  assert.equal(crossTenantData.status, 403, await crossTenantData.text());

  const bEvent = await prisma.exhibition.findUniqueOrThrow({
    where: { id: orgB.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(bEvent.eventId);

  const crossTenantEventFilter = await auth(
    `/api/dashboards/${dashboard.id}/data?eventId=${bEvent.eventId}`,
    orgA.token,
  );
  assert.equal(crossTenantEventFilter.status, 404, await crossTenantEventFilter.text());
});

test("event dashboard data enforces the event module boundary", async () => {
  const org = await bootstrapOrganizer(baseUrl, "fd11-module", ts + 3);
  organizerIds.push(org.organizerId);

  const event = await prisma.exhibition.findUniqueOrThrow({
    where: { id: org.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(event.eventId);

  await prisma.eventModuleEnablement.updateMany({
    where: { eventId: event.eventId, moduleType: "REGISTRATION" },
    data: { enabled: false },
  });

  const dashboard = await createDashboard(org.token, org.organizerId, "EVENT_REGISTRATION_KPI");
  const response = await auth(
    `/api/dashboards/${dashboard.id}/data?eventId=${event.eventId}`,
    org.token,
  );
  assert.equal(response.status, 409, await response.text());
});

test("dashboard update uses optimistic concurrency for stale versions", async () => {
  const org = await bootstrapOrganizer(baseUrl, "fd11-version", ts + 4);
  organizerIds.push(org.organizerId);

  const dashboard = await createDashboard(org.token, org.organizerId, "ORGANIZER_EVENT_KPI");

  const first = await auth(`/api/dashboards/${dashboard.id}`, org.token);
  assert.equal(first.status, 200);
  const current = (await first.json()).dashboard as { version: number };

  const update = await auth(`/api/dashboards/${dashboard.id}`, org.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: current.version, name: "FD11 updated" }),
  });
  assert.equal(update.status, 200, await update.text());

  const stale = await auth(`/api/dashboards/${dashboard.id}`, org.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: current.version, name: "FD11 stale update" }),
  });
  assert.equal(stale.status, 409, await stale.text());
});
