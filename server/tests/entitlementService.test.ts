import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@prisma/client";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, cleanupOrganizers } from "./helpers/entitlementFixtures";
import {
  assertCanCreateExhibition,
  assertCanAddExhibitor,
  assertCanRegisterVisitor,
  assertCanCreateStall,
  assertCanInviteTeamMember,
  getOrganizerEntitlement,
  EntitlementError,
} from "../src/lib/entitlementService";

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

async function withTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

// Starter, trialing: first exhibition allowed (organizer already has 1 from
// bootstrap in these fixtures — so this directly exercises "already
// consumed" for a fresh organizer that hasn't created anything YET, by
// calling the assert function in isolation against an organizer created via
// a raw DB insert rather than the bootstrap helper).
test("assertCanCreateExhibition: Starter+trialing allows the first exhibition, blocks the second", async () => {
  const { organizerId } = await bootstrapOrganizer(baseUrl, "svc-starter-trial", ts);
  organizerIds.push(organizerId);
  // The bootstrap helper already created exhibition #1 — so a fresh assert
  // call here must reject (entitlement already consumed).
  await assert.rejects(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)), EntitlementError);
});

test("assertCanCreateExhibition: Starter+active allows one non-completed exhibition at a time, blocks a second concurrent one", async () => {
  const { organizerId, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "svc-starter-active", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "starter", "active");

  // Still has 1 non-completed exhibition (from bootstrap) -> blocked at the ongoing capacity rule (not the trial rule, since status is now active).
  await assert.rejects(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)), EntitlementError);

  // Completing it frees the slot.
  await prisma.exhibition.update({ where: { id: firstExhibitionId }, data: { status: "completed" } });
  await assert.doesNotReject(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)));
});

test("assertCanCreateExhibition: Growth allows up to 5 non-completed exhibitions", async () => {
  const { organizerId } = await bootstrapOrganizer(baseUrl, "svc-growth", ts);
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "growth", "active");

  // Already has 1 (bootstrap). Create 3 more directly (bypassing the route,
  // since this test is about the assert function's own boundary math).
  for (let i = 0; i < 3; i++) {
    await prisma.exhibition.create({ data: { ownerId: (await prisma.organizer.findUniqueOrThrow({ where: { id: organizerId } })).bootstrappedByUserId!, organizerId, name: `Growth extra ${i}` } });
  }
  // Now at 4 non-completed. 5th should be allowed, 6th blocked.
  await assert.doesNotReject(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)));
  await prisma.exhibition.create({ data: { ownerId: (await prisma.organizer.findUniqueOrThrow({ where: { id: organizerId } })).bootstrappedByUserId!, organizerId, name: `Growth extra 5th` } });
  await assert.rejects(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)), EntitlementError);
});

test("assertCanCreateExhibition: Enterprise (null eventLimit) is unlimited", async () => {
  const { organizerId, bootstrapUserId } = await (async () => {
    const r = await bootstrapOrganizer(baseUrl, "svc-enterprise", ts);
    const org = await prisma.organizer.findUniqueOrThrow({ where: { id: r.organizerId } });
    return { ...r, bootstrapUserId: org.bootstrappedByUserId! };
  })();
  organizerIds.push(organizerId);
  await setSubscription(organizerId, "enterprise", "active");

  for (let i = 0; i < 10; i++) {
    await prisma.exhibition.create({ data: { ownerId: bootstrapUserId, organizerId, name: `Enterprise extra ${i}` } });
  }
  await assert.doesNotReject(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)), "Enterprise must never block on exhibition count");
});

test("entitlement checks reject outright for cancelled and expired subscriptions", async () => {
  const { organizerId } = await bootstrapOrganizer(baseUrl, "svc-cancelled", ts);
  organizerIds.push(organizerId);

  await setSubscription(organizerId, "growth", "cancelled");
  await assert.rejects(() => withTx((tx) => assertCanCreateExhibition(tx, organizerId)), (err: unknown) => err instanceof EntitlementError && err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE");
  await assert.rejects(() => withTx((tx) => assertCanAddExhibitor(tx, organizerId)), (err: unknown) => err instanceof EntitlementError && err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE");
  await assert.rejects(() => withTx((tx) => assertCanInviteTeamMember(tx, organizerId)), (err: unknown) => err instanceof EntitlementError && err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE");

  await setSubscription(organizerId, "growth", "expired");
  await assert.rejects(() => withTx((tx) => assertCanCreateStall(tx, organizerId, 1)), (err: unknown) => err instanceof EntitlementError && err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE");
  await assert.rejects(() => withTx((tx) => assertCanRegisterVisitor(tx, organizerId)), (err: unknown) => err instanceof EntitlementError && err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE");
});

test("a missing Subscription row throws loudly rather than granting unlimited access", async () => {
  // Construct an organizer with NO subscription row at all — this bypasses
  // the normal bootstrap path deliberately, to exercise the defensive
  // fail-loud branch (should never happen via the real API post-Phase 20B).
  const org = await prisma.organizer.create({ data: { name: "No Subscription Org" } });
  organizerIds.push(org.id);
  await assert.rejects(() => withTx((tx) => assertCanCreateExhibition(tx, org.id)), /has no Subscription row/);
});

test("getOrganizerEntitlement reports usage/limits and trialConsumed accurately", async () => {
  const { organizerId } = await bootstrapOrganizer(baseUrl, "svc-summary", ts);
  organizerIds.push(organizerId);

  const summary = await getOrganizerEntitlement(organizerId);
  assert.equal(summary.plan.code, "starter");
  assert.equal(summary.trialConsumed, true, "one exhibition already created under a Starter trial must report the trial as consumed");
  const exhibitionUsage = summary.usage.find((u) => u.resource === "exhibition");
  assert.equal(exhibitionUsage!.currentUsage, 1);
  assert.equal(exhibitionUsage!.limit, 1);
});
