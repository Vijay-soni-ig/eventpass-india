import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const suffix = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
const businessIds: string[] = [];
const eventIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventIds.length) {
      await prisma.eventLead.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    }
    if (businessIds.length) {
      await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
      await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
    }
    await cleanupOrganizers(organizerIds);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `event-lead-pair-${label}-${suffix}`,
    },
    body: JSON.stringify({
      email: `event-lead-pair-${label}-${suffix}@example.com`,
      password: "TestPassword123!",
      fullName: `Event Lead Pair ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { token: body.token as string, userId: body.user.id as string };
}

test("Event lead reads, analytics and export are scoped to exact confirmed Event-business pairs", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "event-lead-pair-" + suffix, suffix);
  organizerIds.push(organizer.organizerId);

  const eventA = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: "Pair Event A " + suffix,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-07-01T00:00:00.000Z"),
      endDate: new Date("2027-07-02T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const eventB = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: "Pair Event B " + suffix,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-08-01T00:00:00.000Z"),
      endDate: new Date("2027-08-02T00:00:00.000Z"),
    },
    select: { id: true },
  });
  eventIds.push(eventA.id, eventB.id);
  await prisma.eventModuleEnablement.createMany({
    data: [eventA.id, eventB.id].map((id) => ({ eventId: id, moduleType: "LEADS", enabled: true })),
  });
  await prisma.eventModuleEnablement.createMany({
    data: [eventA.id, eventB.id].map((id) => ({ eventId: id, moduleType: "EXHIBITORS", enabled: true })),
  });

  const userA = await signup("business-a");
  const userB = await signup("business-b");
  const applicationA = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + userA.token },
    body: JSON.stringify({ eventId: eventA.id }),
  });
  const applicationB = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + userB.token },
    body: JSON.stringify({ eventId: eventB.id }),
  });
  const [applicationBodyA, applicationBodyB] = await Promise.all([applicationA.json(), applicationB.json()]);
  assert.equal(applicationA.status, 201, JSON.stringify(applicationBodyA));
  assert.equal(applicationB.status, 201, JSON.stringify(applicationBodyB));
  const participationA = applicationBodyA.participation;
  const participationB = applicationBodyB.participation;

  const businessA = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: userA.userId }, select: { id: true } });
  const businessB = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: userB.userId }, select: { id: true } });
  businessIds.push(businessA.id, businessB.id);
  await prisma.exhibitorMembership.create({
    data: { userId: userA.userId, exhibitorBusinessId: businessB.id, role: "admin", status: "active" },
  });

  for (const item of [
    { eventId: eventA.id, participationId: participationA.id },
    { eventId: eventB.id, participationId: participationB.id },
  ]) {
    const response = await fetch(baseUrl + `/api/event-exhibitor-participations/events/${item.eventId}/${item.participationId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    assert.equal(response.status, 200, await response.text());
  }

  const validA = await prisma.eventLead.create({
    data: {
      eventId: eventA.id,
      exhibitorBusinessId: businessA.id,
      eventExhibitorParticipationId: participationA.id,
      visitorName: "Valid Pair A Visitor",
    },
    select: { id: true },
  });
  const validB = await prisma.eventLead.create({
    data: {
      eventId: eventB.id,
      exhibitorBusinessId: businessB.id,
      eventExhibitorParticipationId: participationB.id,
      visitorName: "Valid Pair B Visitor",
    },
    select: { id: true },
  });
  // Simulate a stale/mismatched row: the caller belongs to both businesses and
  // can access Event B through Business B, but Business A is not a participant
  // in Event B. Event IDs and business IDs must not be unioned independently.
  const mismatched = await prisma.eventLead.create({
    data: {
      eventId: eventB.id,
      exhibitorBusinessId: businessA.id,
      visitorName: "Mismatched Pair Visitor",
    },
    select: { id: true },
  });
  const validFollowUp = await prisma.eventLeadFollowUp.create({
    data: { leadId: validA.id, assignedToUserId: userA.userId, dueAt: new Date(Date.now() + 86_400_000), note: "Valid Event A follow-up" },
    select: { id: true },
  });
  const mismatchedFollowUp = await prisma.eventLeadFollowUp.create({
    data: { leadId: mismatched.id, assignedToUserId: userA.userId, dueAt: new Date(Date.now() + 86_400_000), note: "Mismatched Event B follow-up" },
    select: { id: true },
  });

  const headers = { Authorization: "Bearer " + userA.token };
  const list = await fetch(baseUrl + "/api/event-leads", { headers });
  const listBody = await list.json();
  assert.equal(list.status, 200, JSON.stringify(listBody));
  const visibleIds = new Set(listBody.leads.map((lead: { id: string }) => lead.id));
  assert.deepEqual(visibleIds, new Set([validA.id, validB.id]));
  assert.equal(visibleIds.has(mismatched.id), false, "a lead for an unconfirmed Event-business pair must remain hidden");

  const mismatchedDetail = await fetch(baseUrl + `/api/event-leads/${mismatched.id}?exhibitorBusinessId=${businessA.id}`, { headers });
  assert.equal(mismatchedDetail.status, 404);

  const businessAAnalytics = await fetch(baseUrl + `/api/event-leads/analytics?exhibitorBusinessId=${businessA.id}`, { headers });
  const analyticsBody = await businessAAnalytics.json();
  assert.equal(businessAAnalytics.status, 200, JSON.stringify(analyticsBody));
  assert.equal(analyticsBody.totalLeads, 1, "Business A analytics must exclude Event B rows");

  const followUpsResponse = await fetch(baseUrl + `/api/event-leads/follow-ups?exhibitorBusinessId=${businessA.id}&due=ALL`, { headers });
  const followUpsBody = await followUpsResponse.json();
  assert.equal(followUpsResponse.status, 200, JSON.stringify(followUpsBody));
  const visibleFollowUpIds = new Set(followUpsBody.followUps.map((item: { id: string }) => item.id));
  assert.deepEqual(visibleFollowUpIds, new Set([validFollowUp.id]));
  assert.equal(visibleFollowUpIds.has(mismatchedFollowUp.id), false, "follow-ups must inherit the exact Event-business lead scope");

  const mismatchedSearchFollowUps = await fetch(
    baseUrl + `/api/event-leads/follow-ups?exhibitorBusinessId=${businessA.id}&due=ALL&search=Mismatched`,
    { headers },
  );
  const mismatchedSearchFollowUpsBody = await mismatchedSearchFollowUps.json();
  assert.equal(mismatchedSearchFollowUps.status, 200, JSON.stringify(mismatchedSearchFollowUpsBody));
  assert.deepEqual(mismatchedSearchFollowUpsBody.followUps, [], "search must not replace the Event-business pair authorization predicate");

  const validSearchFollowUps = await fetch(
    baseUrl + `/api/event-leads/follow-ups?exhibitorBusinessId=${businessA.id}&due=ALL&search=Valid%20Pair%20A`,
    { headers },
  );
  const validSearchFollowUpsBody = await validSearchFollowUps.json();
  assert.equal(validSearchFollowUps.status, 200, JSON.stringify(validSearchFollowUpsBody));
  assert.deepEqual(validSearchFollowUpsBody.followUps.map((item: { id: string }) => item.id), [validFollowUp.id]);

  const exportResponse = await fetch(baseUrl + `/api/event-leads/export?exhibitorBusinessId=${businessA.id}`, { headers });
  const exportCsv = await exportResponse.text();
  assert.equal(exportResponse.status, 200, exportCsv);
  assert.match(exportCsv, /Valid Pair A Visitor/);
  assert.doesNotMatch(exportCsv, /Mismatched Pair Visitor/);

  const mismatchedSearchExport = await fetch(
    baseUrl + `/api/event-leads/export?exhibitorBusinessId=${businessA.id}&search=Mismatched`,
    { headers },
  );
  const mismatchedSearchCsv = await mismatchedSearchExport.text();
  assert.equal(mismatchedSearchExport.status, 200, mismatchedSearchCsv);
  assert.doesNotMatch(mismatchedSearchCsv, /Mismatched Pair Visitor/, "export search must not replace the Event-business pair authorization predicate");

  const validSearchExport = await fetch(
    baseUrl + `/api/event-leads/export?exhibitorBusinessId=${businessA.id}&search=Valid%20Pair%20A`,
    { headers },
  );
  const validSearchCsv = await validSearchExport.text();
  assert.equal(validSearchExport.status, 200, validSearchCsv);
  assert.match(validSearchCsv, /Valid Pair A Visitor/);
  assert.doesNotMatch(validSearchCsv, /Mismatched Pair Visitor/);
});
