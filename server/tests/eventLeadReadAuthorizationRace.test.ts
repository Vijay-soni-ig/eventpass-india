import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

test("universal Event Lead list and detail revalidate exhibitor membership under the tenant lock", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, `event-lead-read-race-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    `event-lead-read-race-exhibitor-${ts}`,
    ts,
  );
  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: organizer.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(exhibition.eventId, "exhibition must have a linked Event");

  const participation = await prisma.exhibitionExhibitor.update({
    where: { id: exhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitorBusinessId: true },
  });
  let membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: {
      userId: exhibitor.userId,
      exhibitorBusinessId: participation.exhibitorBusinessId,
      status: "active",
    },
  });
  const lead = await prisma.eventLead.create({
    data: {
      eventId: exhibition.eventId,
      exhibitorBusinessId: participation.exhibitorBusinessId,
      exhibitionExhibitorId: participation.id,
      visitorName: "Private Universal Lead Visitor",
      visitorEmail: `event-lead-read-race-${ts}@example.com`,
      source: "MANUAL",
      capturedByUserId: exhibitor.userId,
    },
    select: { id: true },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  const cases = [
    {
      path: `/api/event-leads?eventId=${exhibition.eventId}`,
      expectedStatus: 200,
      assertBody: async (response: Response) => {
        const body = await response.json() as { leads: Array<{ id: string }> };
        assert.ok(
          body.leads.every((item) => item.id !== lead.id),
          "revoked membership must not receive private Event Lead rows",
        );
      },
    },
    {
      path: `/api/event-leads/${lead.id}`,
      expectedStatus: 404,
    },
  ];

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const scenario = cases[index];
      client.$transaction = (async (...args: unknown[]) => {
        // Simulate membership revocation after the candidate-ID preflight
        // but before the protected read transaction begins.
        await prisma.exhibitorMembership.delete({ where: { id: membership.id } });
        return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
      }) as typeof client.$transaction;

      let response: Response;
      try {
        response = await fetch(baseUrl + scenario.path, {
          headers: { Authorization: "Bearer " + exhibitor.token },
        });
      } finally {
        client.$transaction = originalTransaction;
      }

      if (response.status !== scenario.expectedStatus) {
        assert.fail(`Expected HTTP ${scenario.expectedStatus}, received ${response.status}: ${await response.text()}`);
      }
      if (scenario.assertBody) await scenario.assertBody(response);

      // Restore membership before testing the next endpoint independently.
      membership = await prisma.exhibitorMembership.create({
        data: {
          exhibitorBusinessId: participation.exhibitorBusinessId,
          userId: exhibitor.userId,
          invitedEmail: `event-lead-read-race-${ts}-${index}@example.com`,
          role: "owner",
          status: "active",
        },
      });
    }
  } finally {
    client.$transaction = originalTransaction;
    await prisma.exhibitorMembership.deleteMany({
      where: { exhibitorBusinessId: participation.exhibitorBusinessId, userId: exhibitor.userId },
    });
    await prisma.eventLead.deleteMany({ where: { id: lead.id } });
  }

  assert.ok(
    await prisma.eventLead.findUnique({ where: { id: lead.id } }) === null,
    "test cleanup must remove the private lead fixture",
  );
});
