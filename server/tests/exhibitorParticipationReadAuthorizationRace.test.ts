import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import {
  bootstrapOrganizer,
  applyAsExhibitor,
  cleanupOrganizers,
} from "./helpers/entitlementFixtures";

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

/**
 * Simulate the exact authorization race: the permission preflight returns a
 * valid business ID, then membership is revoked before the protected read.
 * A correct route must revalidate membership after acquiring the business
 * row lock and must not return data from the stale candidate ID.
 */
async function requestAfterRevocation(
  exhibitor: { userId: string; token: string },
  url: string,
) {
  const delegate = prisma.exhibitorMembership as unknown as {
    findMany: typeof prisma.exhibitorMembership.findMany;
  };
  const originalFindMany = delegate.findMany;
  delegate.findMany = (async (...args: Parameters<typeof originalFindMany>) => {
    const memberships = await originalFindMany(...args);
    await prisma.exhibitorMembership.deleteMany({
      where: { userId: exhibitor.userId },
    });
    return memberships;
  }) as typeof originalFindMany;

  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${exhibitor.token}` },
    });
  } finally {
    delegate.findMany = originalFindMany;
  }
}

test("participation list excludes a business revoked after permission preflight", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "participation-read-race-list", ts);
  organizerIds.push(organizer.organizerId);
  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "participation-read-race-list",
    ts,
  );

  const response = await requestAfterRevocation(
    exhibitor,
    `${baseUrl}/api/exhibitor/participations`,
  );
  const body = await response.json() as { participations: Array<{ id: string }> };
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(
    body.participations.some((item) => item.id === exhibitor.participationId),
    false,
    "revoked membership must not expose the participation through a stale authorization snapshot",
  );
});

test("all exhibitor stall payment history excludes a business revoked after permission preflight", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "participation-read-race-payments", ts + 1);
  organizerIds.push(organizer.organizerId);
  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "participation-read-race-payments",
    ts + 1,
  );

  const response = await requestAfterRevocation(
    exhibitor,
    `${baseUrl}/api/exhibitor/participations/payments`,
  );
  const body = await response.json() as { bookings: Array<{ exhibitionExhibitorId: string }> };
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.bookings, []);
});

test("participation payment history returns not found after membership is revoked at read time", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "participation-read-race-history", ts + 2);
  organizerIds.push(organizer.organizerId);
  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "participation-read-race-history",
    ts + 2,
  );

  const response = await requestAfterRevocation(
    exhibitor,
    `${baseUrl}/api/exhibitor/participations/${exhibitor.participationId}/payments`,
  );
  assert.equal(response.status, 404, await response.text());
});
