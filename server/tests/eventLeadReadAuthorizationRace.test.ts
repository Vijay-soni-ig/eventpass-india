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

  const membershipClient = prisma as unknown as {
    exhibitorMembership: { findMany: typeof prisma.exhibitorMembership.findMany };
  };
  const originalFindMany = membershipClient.exhibitorMembership.findMany;
  const cases = [
    {
      path: `/api/event-leads?eventId=${exhibition.eventId}`,
      expectedStatus: 200,
      change: "revoke" as const,
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
      change: "suspend" as const,
    },
  ];

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const scenario = cases[index];
      let tenantStateChanged = false;
      membershipClient.exhibitorMembership.findMany = (async (...args: unknown[]) => {
        const rows = await (originalFindMany as (...inner: unknown[]) => Promise<unknown>).apply(
          prisma.exhibitorMembership,
          args,
        );
        if (!tenantStateChanged) {
          tenantStateChanged = true;
          // Change access immediately after the preflight returns its stale
          // candidate membership, before either endpoint reads Event Leads.
          if (scenario.change === "revoke") {
            await prisma.exhibitorMembership.delete({ where: { id: membership.id } });
          } else {
            await prisma.exhibitorBusiness.update({
              where: { id: participation.exhibitorBusinessId },
              data: { suspended: true },
            });
          }
        }
        return rows;
      }) as typeof membershipClient.exhibitorMembership.findMany;

      let response: Response;
      try {
        response = await fetch(baseUrl + scenario.path, {
          headers: { Authorization: "Bearer " + exhibitor.token },
        });
      } finally {
        membershipClient.exhibitorMembership.findMany = originalFindMany;
      }
      assert.equal(tenantStateChanged, true, "the authorization race window must be exercised");

      if (response.status !== scenario.expectedStatus) {
        assert.fail(`Expected HTTP ${scenario.expectedStatus}, received ${response.status}: ${await response.text()}`);
      }
      if (scenario.assertBody) await scenario.assertBody(response);

      // Restore the tenant state before testing the next endpoint independently.
      if (scenario.change === "revoke") {
        membership = await prisma.exhibitorMembership.create({
          data: {
            exhibitorBusinessId: participation.exhibitorBusinessId,
            userId: exhibitor.userId,
            invitedEmail: `event-lead-read-race-${ts}-${index}@example.com`,
            role: "owner",
            status: "active",
          },
        });
      } else {
        await prisma.exhibitorBusiness.update({
          where: { id: participation.exhibitorBusinessId },
          data: { suspended: false },
        });
      }
    }
  } finally {
    membershipClient.exhibitorMembership.findMany = originalFindMany;
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
