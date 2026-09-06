import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, applyAsExhibitor, approveParticipation, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

/** Sets up a Growth organizer (150 exhibitor limit is too many to fill in a test) downgraded in spirit by testing against Starter's 25 limit instead — but 25 is still a lot of HTTP round-trips for a boundary test, so this file uses direct-DB-insert applications/approvals for the "fill up to the boundary" bulk part, and only drives the LAST 1-2 approvals through the real API (which is what actually matters — the entitlement check itself). */
async function fillExhibitorsDirectly(exhibitionId: string, businessCount: number, status: "approved" = "approved") {
  for (let i = 0; i < businessCount; i++) {
    const owner = await prisma.user.create({
      data: { email: `phase20c-bulk-owner-${ts}-${i}-${exhibitionId}@example.com`, passwordHash: "unused", fullName: `Bulk Owner ${i}`, userType: "exhibitor" },
    });
    const business = await prisma.exhibitorBusiness.create({ data: { ownerId: owner.id, companyName: `Bulk Exhibitor ${ts}-${i}` } });
    await prisma.exhibitionExhibitor.create({ data: { exhibitionId, exhibitorBusinessId: business.id, status } });
  }
}

// Test — boundary + over-limit, via the real approval endpoint at the edge.
test("Starter allows exactly 25 approved exhibitors, blocks the 26th approval", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "exhibitor-boundary", ts);
  organizerIds.push(organizerId);

  await fillExhibitorsDirectly(firstExhibitionId, 24); // 24 approved directly
  const { token: exhibitorToken25, participationId: p25 } = await applyAsExhibitor(baseUrl, firstExhibitionId, "exhibitor-25", ts);
  void exhibitorToken25;
  const approve25 = await approveParticipation(baseUrl, token, firstExhibitionId, p25);
  assert.equal(approve25.status, 200, JSON.stringify(approve25.body)); // 25th — at the limit, allowed

  const { participationId: p26 } = await applyAsExhibitor(baseUrl, firstExhibitionId, "exhibitor-26", ts);
  const approve26 = await approveParticipation(baseUrl, token, firstExhibitionId, p26);
  assert.equal(approve26.status, 409, JSON.stringify(approve26.body));
  assert.equal(approve26.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(approve26.body.error.resource, "exhibitor");
  assert.equal(approve26.body.error.currentUsage, 25);
  assert.equal(approve26.body.error.limit, 25);

  // The blocked application must remain "applied", not silently approved.
  const application26 = await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: p26 } });
  assert.equal(application26.status, "applied");
});

// Test — status counting: rejected/cancelled applications never count.
test("rejected and cancelled participations never count toward the exhibitor limit", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "exhibitor-status-count", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active"); // 150 limit, irrelevant here — just want a plain "approved counts, rejected doesn't" check

  await fillExhibitorsDirectly(firstExhibitionId, 0); // no-op, just for symmetry

  const { participationId: rejectedId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "to-be-rejected", ts);
  const reject = await fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/exhibitors/${rejectedId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "rejected" }),
  });
  assert.equal(reject.status, 200);

  const { participationId: approvedId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "to-be-approved", ts);
  const cancel = await approveParticipation(baseUrl, token, firstExhibitionId, approvedId);
  assert.equal(cancel.status, 200);
  await fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/exhibitors/${approvedId}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });

  // Neither the rejected nor the (approved-then-cancelled) participation
  // should count — an unrelated new approval should still succeed cleanly.
  const { participationId: freshId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "fresh-one", ts);
  const approveFresh = await approveParticipation(baseUrl, token, firstExhibitionId, freshId);
  assert.equal(approveFresh.status, 200, JSON.stringify(approveFresh.body));

  const consumingCount = await prisma.exhibitionExhibitor.count({
    where: { exhibitionId: firstExhibitionId, status: { in: ["approved", "stall_pending", "stall_reserved", "payment_pending", "confirmed"] } },
  });
  assert.equal(consumingCount, 1, "only the fresh, still-approved participation should count");
});

// Test — concurrency: final exhibitor slot race.
test("concurrency: two simultaneous approvals for the final exhibitor slot — exactly one succeeds", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "exhibitor-race", ts);
  organizerIds.push(organizerId);
  await fillExhibitorsDirectly(firstExhibitionId, 24); // 24/25 used

  const { participationId: pA } = await applyAsExhibitor(baseUrl, firstExhibitionId, "race-a", ts);
  const { participationId: pB } = await applyAsExhibitor(baseUrl, firstExhibitionId, "race-b", ts);

  const [a, b] = await Promise.all([
    approveParticipation(baseUrl, token, firstExhibitionId, pA),
    approveParticipation(baseUrl, token, firstExhibitionId, pB),
  ]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409], `expected exactly one approval to succeed: ${JSON.stringify([a.status, b.status])}`);

  const consumingCount = await prisma.exhibitionExhibitor.count({
    where: { exhibitionId: firstExhibitionId, status: { in: ["approved", "stall_pending", "stall_reserved", "payment_pending", "confirmed"] } },
  });
  assert.equal(consumingCount, 25, "must never exceed the Starter limit of 25, even under concurrent approval");
});
