import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("concurrent exhibitors cannot reserve the same stall", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase26-8-concurrency", ts);
  organizerIds.push(organizerId);

  const { token: exhibitorAToken, participationId: pA } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase26-8-a", ts);
  const { token: exhibitorBToken, participationId: pB } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase26-8-b", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pA);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pB);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 10000);

  const results = await Promise.all([
    selectStall(baseUrl, exhibitorAToken, pA, stall.body.stall.id),
    selectStall(baseUrl, exhibitorBToken, pB, stall.body.stall.id),
  ]);

  const statuses = results.map((result) => result.status).sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], "exactly one concurrent reservation must win");

  const persisted = await prisma.stall.findUnique({ where: { id: stall.body.stall.id } });
  assert.equal(persisted?.status, "reserved");
  assert.ok([pA, pB].includes(persisted?.exhibitionExhibitorId ?? ""));

  const participants = await prisma.exhibitionExhibitor.findMany({
    where: { id: { in: [pA, pB] } },
    select: { id: true, status: true },
  });
  assert.equal(participants.filter((p) => p.status === "stall_reserved").length, 1);
  assert.equal(participants.filter((p) => p.status === "approved").length, 1);
});
