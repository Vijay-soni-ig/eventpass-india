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

test("private exhibitor lead list, detail, and export revalidate membership after the business lock", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, `lead-read-race-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    `lead-read-race-exhibitor-${ts}`,
    ts,
  );
  const participation = await prisma.exhibitionExhibitor.update({
    where: { id: exhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitorBusinessId: true },
  });
  let membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: exhibitor.userId, exhibitorBusinessId: participation.exhibitorBusinessId },
  });
  const lead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: participation.id,
      visitorName: "Private Read Race Visitor",
      visitorEmail: `lead-read-race-${ts}@example.com`,
      capturedByUserId: exhibitor.userId,
    },
    select: { id: true },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  const cases = [
    { path: "/api/leads", expectedStatus: 200, assertBody: async (response: Response) => {
      const body = await response.json() as { leads: Array<{ id: string }> };
      assert.ok(body.leads.every((item) => item.id !== lead.id), "revoked membership must not receive private lead rows");
    } },
    { path: `/api/leads/${lead.id}`, expectedStatus: 404 },
    { path: "/api/leads/export", expectedStatus: 403 },
  ];

  try {
    for (const scenario of cases) {
      client.$transaction = (async (...args: unknown[]) => {
        // Simulate revocation after the permission preflight but before the
        // route obtains its transaction and revalidates under the row lock.
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

      if (response!.status !== scenario.expectedStatus) {\n        assert.fail(`Expected HTTP ${scenario.expectedStatus}, received ${response!.status}: ${await response!.text()}`);\n      }
      if (scenario.assertBody) await scenario.assertBody(response!);

      // Restore the membership for the next independent endpoint race.
      membership = await prisma.exhibitorMembership.create({
        data: {
          exhibitorBusinessId: participation.exhibitorBusinessId,
          userId: exhibitor.userId,
          invitedEmail: `lead-read-race-${ts}-${scenario.path.replaceAll("/", "-")}@example.com`,
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
  }

  assert.ok(await prisma.lead.findUnique({ where: { id: lead.id } }), "read denial must not mutate the lead");
});
