import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
let standaloneEventId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (standaloneEventId) await prisma.event.deleteMany({ where: { id: standaloneEventId } });
  } finally {
    await stop();
  }
});

async function signup(label: string) {
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "lead-context-isolation-" + label,
    },
    body: JSON.stringify({
      email: "lead-context-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Lead Context " + label,
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

test("lead capture contexts only expose the caller's confirmed exhibitor participation", async () => {
  const owner = await signup("owner");
  const other = await signup("other");

  const exhibitionResponse = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      name: "Lead context isolation " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const exhibitionBody = await exhibitionResponse.json();
  assert.equal(exhibitionResponse.status, 201, JSON.stringify(exhibitionBody));
  const exhibitionId = exhibitionBody.exhibition.id as string;
  const eventId = exhibitionBody.exhibition.eventId as string;
  assert.ok(eventId, "legacy exhibition should link to its canonical Event");

  const ownerBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: owner.userId } });
  const otherBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: other.userId } });
  assert.ok(ownerBusiness);
  assert.ok(otherBusiness);

  const ownerParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: ownerBusiness.id, status: "confirmed" },
  });
  const otherParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: otherBusiness.id, status: "confirmed" },
  });

  // Standalone Events can enable LEADS, but current exhibitor capture is Exhibition-participation scoped.
  const standaloneEvent = await prisma.event.create({
    data: {
      organizerId: exhibitionBody.exhibition.organizerId,
      ownerId: owner.userId,
      title: "Standalone lead boundary " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-06-01T00:00:00.000Z"),
      endDate: new Date("2027-06-02T00:00:00.000Z"),
      venue: "Standalone venue",
      city: "Test City",
      moduleEnablements: { create: [{ moduleType: "LEADS", enabled: true }] },
    },
    select: { id: true },
  });
  standaloneEventId = standaloneEvent.id;

  const otherResponse = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(otherResponse.status, 200);
  const contexts = (await otherResponse.json()).contexts;
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].participationId, otherParticipation.id);
  assert.equal(contexts[0].exhibitorBusinessId, otherBusiness.id);
  assert.notEqual(contexts[0].participationId, ownerParticipation.id);
  assert.equal(
    contexts.some((context: { eventId: string }) => context.eventId === standaloneEvent.id),
    false,
    "a standalone Event without Exhibition linkage must not expose exhibitor lead-capture context",
  );

  const directCapture = await fetch(baseUrl + "/api/event-leads/from-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({
      eventId: standaloneEvent.id,
      ticketId: "standalone-event-no-ticket",
      exhibitorBusinessId: otherBusiness.id,
    }),
  });
  assert.equal(
    directCapture.status,
    403,
    "the direct ticket-lead API must deny an exhibitor whose confirmed participation does not scope this standalone Event",
  );

  const disabled = await prisma.eventModuleEnablement.updateMany({
    where: { eventId, moduleType: "LEADS" },
    data: { enabled: false },
  });
  assert.equal(disabled.count, 1, "fixture must have a LEADS module enablement to disable");

  const disabledModuleResponse = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(disabledModuleResponse.status, 200);
  assert.deepEqual(
    (await disabledModuleResponse.json()).contexts,
    [],
    "disabled LEADS module must not expose a lead-capture context through the direct API",
  );


  // Simulate membership revocation after the permission preflight has read
  // the active membership but before the route begins its protected read.
  await prisma.eventModuleEnablement.updateMany({
    where: { eventId, moduleType: "LEADS" },
    data: { enabled: true },
  });
  const membershipDelegate = prisma.exhibitorMembership as unknown as {
    findMany: typeof prisma.exhibitorMembership.findMany;
  };
  const originalFindMany = membershipDelegate.findMany;
  membershipDelegate.findMany = (async (...args: Parameters<typeof originalFindMany>) => {
    const memberships = await originalFindMany(...args);
    await prisma.exhibitorMembership.deleteMany({
      where: { exhibitorBusinessId: otherBusiness.id, userId: other.userId },
    });
    return memberships;
  }) as typeof originalFindMany;
  try {
    const revokedDuringPreflight = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
      headers: { Authorization: "Bearer " + other.token },
    });
    assert.equal(revokedDuringPreflight.status, 200);
    assert.deepEqual(
      (await revokedDuringPreflight.json()).contexts,
      [],
      "a membership revoked after preflight must not expose stale lead-capture contexts",
    );
  } finally {
    membershipDelegate.findMany = originalFindMany;
  }

  await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: [ownerParticipation.id, otherParticipation.id] } } });
});
