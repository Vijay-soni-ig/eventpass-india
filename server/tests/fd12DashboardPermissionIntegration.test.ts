import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { applyAsExhibitor, bootstrapOrganizer, cleanupOrganizers, login } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (organizerIds.length) {
    await prisma.dashboard.deleteMany({ where: { ownerType: { in: ["ORGANIZER", "EXHIBITOR"] }, OR: [
      { ownerType: "ORGANIZER", ownerId: { in: organizerIds } },
      { ownerType: "EXHIBITOR", ownerId: { in: (await prisma.exhibitorBusiness.findMany({ where: { participations: { some: { exhibition: { organizerId: { in: organizerIds } } } } }, select: { id: true } })).map((b) => b.id) } },
    ] } });
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

async function createDashboard(
  token: string,
  ownerType: "ORGANIZER" | "EXHIBITOR",
  ownerId: string,
  widgets: string[],
) {
  const response = await auth("/api/dashboards", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerType,
      ownerId,
      name: `FD12 ${ownerType} ${Date.now()}`,
      widgets: widgets.map((widgetType, index) => ({ widgetType, x: index % 4, y: Math.floor(index / 4) })),
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.dashboard as { id: string; version: number };
}

async function createOrganizerRoleUser(organizerId: string, role: "admin" | "operations" | "finance" | "marketing" | "scanner", label: string) {
  const email = `fd12-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `FD12 ${label}`, userType: "visitor" }),
  }).then((res) => res.json());
  assert.ok(signup.user?.id, JSON.stringify(signup));
  await prisma.organizerMembership.create({
    data: { organizerId, userId: signup.user.id, role, status: "active" },
  });
  return { userId: signup.user.id as string, token: await login(baseUrl, email, "TestPassword123!") };
}

test("organizer dashboard widgets are filtered by the full role permission matrix", async () => {
  const org = await bootstrapOrganizer(baseUrl, "fd12-matrix", ts + 1);
  organizerIds.push(org.organizerId);

  const allOrganizerWidgets = [
    "ORGANIZER_EVENT_KPI",
    "ORGANIZER_REVENUE_KPI",
    "ORGANIZER_ATTENDANCE_KPI",
    "ORGANIZER_STALL_OCCUPANCY",
    "ORGANIZER_LEAD_CONVERSION",
  ];
  const dashboard = await createDashboard(org.token, "ORGANIZER", org.organizerId, allOrganizerWidgets);

  const cases: Array<{
    role: "admin" | "operations" | "finance" | "marketing" | "scanner";
    expected: string[];
  }> = [
    { role: "admin", expected: allOrganizerWidgets },
    { role: "operations", expected: ["ORGANIZER_EVENT_KPI", "ORGANIZER_ATTENDANCE_KPI", "ORGANIZER_STALL_OCCUPANCY"] },
    { role: "finance", expected: ["ORGANIZER_EVENT_KPI", "ORGANIZER_REVENUE_KPI"] },
    { role: "marketing", expected: ["ORGANIZER_EVENT_KPI", "ORGANIZER_ATTENDANCE_KPI", "ORGANIZER_LEAD_CONVERSION"] },
    { role: "scanner", expected: ["ORGANIZER_EVENT_KPI"] },
  ];

  for (const item of cases) {
    const member = await createOrganizerRoleUser(org.organizerId, item.role, item.role);
    const response = await auth(`/api/dashboards/${dashboard.id}`, member.token);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    const actual = (body.dashboard.widgets as Array<{ widgetType: string }>).map((widget) => widget.widgetType).sort();
    assert.deepEqual(actual, [...item.expected].sort(), `unexpected widgets for ${item.role}`);
  }
});

test("exhibitor dashboards are tenant-isolated across exhibitor businesses", async () => {
  const org = await bootstrapOrganizer(baseUrl, "fd12-exhibitors", ts + 2);
  organizerIds.push(org.organizerId);

  const first = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "first", ts + 3);
  const second = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "second", ts + 4);

  const firstMembership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: first.userId, status: "active" },
    select: { exhibitorBusinessId: true },
  });
  const secondMembership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: second.userId, status: "active" },
    select: { exhibitorBusinessId: true },
  });

  const dashboard = await createDashboard(first.token, "EXHIBITOR", firstMembership.exhibitorBusinessId, [
    "EXHIBITOR_LEAD_KPI",
    "EXHIBITOR_CONVERSION_KPI",
    "EXHIBITOR_FOLLOWUP_KPI",
  ]);

  const crossTenantRead = await auth(`/api/dashboards/${dashboard.id}`, second.token);
  assert.equal(crossTenantRead.status, 403, await crossTenantRead.text());

  const crossTenantData = await auth(`/api/dashboards/${dashboard.id}/data`, second.token);
  assert.equal(crossTenantData.status, 403, await crossTenantData.text());

  const crossTenantList = await auth(
    `/api/dashboards?ownerType=EXHIBITOR&ownerId=${firstMembership.exhibitorBusinessId}`,
    second.token,
  );
  assert.equal(crossTenantList.status, 403, await crossTenantList.text());

  const ownRead = await auth(`/api/dashboards/${dashboard.id}`, first.token);
  assert.equal(ownRead.status, 200, await ownRead.text());
  const ownBody = await ownRead.json();
  assert.equal(ownBody.dashboard.ownerId, firstMembership.exhibitorBusinessId);
  assert.notEqual(firstMembership.exhibitorBusinessId, secondMembership.exhibitorBusinessId);
});
