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
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "event-lead-isolation-" + label,
    },
    body: JSON.stringify({
      email: "event-lead-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Event Lead " + label,
      userType: "exhibitor",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));

  const onboarding = await fetch(baseUrl + "/api/onboarding", {
    headers: { Authorization: "Bearer " + body.token },
  });
  assert.equal(onboarding.status, 200);

  return { token: body.token as string, userId: body.user.id as string };
}

async function createSharedEvent(ownerToken: string) {
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerToken },
    body: JSON.stringify({
      name: "Event lead isolation " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.ok(body.exhibition?.id);
  assert.ok(body.exhibition?.eventId);
  return { exhibitionId: body.exhibition.id as string, eventId: body.exhibition.eventId as string };
}

test("event leads remain tenant-scoped for exhibitors sharing the same event", async () => {
  const owner = await signup("owner");
  const other = await signup("other");
  const outsider = await signup("outsider");
  const { exhibitionId, eventId } = await createSharedEvent(owner.token);
  // Give the other exhibitor organizer access to a different event as well.
  // Mixed-role users must still remain scoped to their own exhibitor business
  // when accessing an event they do not organize.
  await createSharedEvent(other.token);

  const ownerBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: owner.userId } });
  const otherBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: other.userId } });
  const outsiderBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: outsider.userId } });
  assert.ok(ownerBusiness);
  assert.ok(otherBusiness);
  assert.ok(outsiderBusiness);
  assert.notEqual(ownerBusiness.id, otherBusiness.id);
  assert.notEqual(ownerBusiness.id, outsiderBusiness.id);

  const ownerParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: ownerBusiness.id, status: "confirmed" },
  });
  const otherParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: otherBusiness.id, status: "confirmed" },
  });

  const ownerLead = await prisma.eventLead.create({
    data: {
      eventId,
      exhibitorBusinessId: ownerBusiness.id,
      exhibitionExhibitorId: ownerParticipation.id,
      visitorName: "Owner Visitor",
      source: "MANUAL",
      capturedByUserId: owner.userId,
    },
  });
  const otherLead = await prisma.eventLead.create({
    data: {
      eventId,
      exhibitorBusinessId: otherBusiness.id,
      exhibitionExhibitorId: otherParticipation.id,
      visitorName: "Other Visitor",
      source: "MANUAL",
      capturedByUserId: other.userId,
    },
  });

  const otherList = await fetch(baseUrl + "/api/event-leads?eventId=" + eventId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(otherList.status, 200);
  const listedIds = (await otherList.json()).leads.map((lead: { id: string }) => lead.id);
  assert.deepEqual(listedIds, [otherLead.id]);

  const crossCreate = await fetch(baseUrl + "/api/event-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({
      eventId,
      exhibitorBusinessId: ownerBusiness.id,
      visitorName: "Unauthorized mixed-role lead",
      source: "MANUAL",
    }),
  });
  assert.equal(crossCreate.status, 403, "an organizer of a different event must not create leads for another exhibitor");

  const nonParticipantCreate = await fetch(baseUrl + "/api/event-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      eventId,
      exhibitorBusinessId: outsiderBusiness.id,
      visitorName: "Lead for non-participating exhibitor",
      source: "MANUAL",
    }),
  });
  assert.equal(
    nonParticipantCreate.status,
    400,
    "an event organizer must not attach a lead to an exhibitor without confirmed participation in that event",
  );

  const crossDetail = await fetch(baseUrl + "/api/event-leads/" + ownerLead.id, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossDetail.status, 404);

  const crossUpdate = await fetch(baseUrl + "/api/event-leads/" + ownerLead.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({ status: "QUALIFIED" }),
  });
  assert.equal(crossUpdate.status, 404);

  const crossArchive = await fetch(baseUrl + "/api/event-leads/" + ownerLead.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossArchive.status, 404);

  const crossInteraction = await fetch(baseUrl + "/api/event-leads/" + ownerLead.id + "/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({ type: "NOTE", note: "cross-tenant attempt" }),
  });
  assert.equal(crossInteraction.status, 404);

  const stillOwnerLead = await prisma.eventLead.findUnique({ where: { id: ownerLead.id } });
  assert.ok(stillOwnerLead);
  assert.equal(stillOwnerLead.status, "NEW");

  await prisma.eventLead.deleteMany({ where: { id: { in: [ownerLead.id, otherLead.id] } } });
  await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: [ownerParticipation.id, otherParticipation.id] } } });
});
