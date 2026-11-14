import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete } from "./helpers/phase21bFixtures";

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

// -------- P1-3: Exhibitor Stalls scoping (via GET /api/exhibitor/participations, the Stalls page's new data source) --------

test("GET /api/exhibitor/participations exposes only the caller's own allocated stalls, never another exhibitor's", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stalls-scope", ts);
  organizerIds.push(org.organizerId);

  const a = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "stalls-scope-a", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, a.participationId);
  const stallA = await createStall(baseUrl, org.token, org.firstExhibitionId, 2000);
  const reserveA = await selectStall(baseUrl, a.token, a.participationId, stallA.body.stall.id);
  assert.equal(reserveA.status, 200, JSON.stringify(reserveA.body));

  const b = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "stalls-scope-b", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, b.participationId);
  const stallB = await createStall(baseUrl, org.token, org.firstExhibitionId, 3000);
  const reserveB = await selectStall(baseUrl, b.token, b.participationId, stallB.body.stall.id);
  assert.equal(reserveB.status, 200, JSON.stringify(reserveB.body));

  const resA = await fetch(`${baseUrl}/api/exhibitor/participations`, { headers: { Authorization: `Bearer ${a.token}` } });
  const bodyA = await resA.json();
  const stallIdsA = bodyA.participations.flatMap((p: { stalls: { id: string }[] }) => p.stalls.map((s) => s.id));
  assert.ok(stallIdsA.includes(stallA.body.stall.id), "exhibitor A must see their own allocated stall");
  assert.ok(!stallIdsA.includes(stallB.body.stall.id), "exhibitor A must NOT see exhibitor B's stall");

  const resB = await fetch(`${baseUrl}/api/exhibitor/participations`, { headers: { Authorization: `Bearer ${b.token}` } });
  const bodyB = await resB.json();
  const stallIdsB = bodyB.participations.flatMap((p: { stalls: { id: string }[] }) => p.stalls.map((s) => s.id));
  assert.ok(stallIdsB.includes(stallB.body.stall.id), "exhibitor B must see their own allocated stall");
  assert.ok(!stallIdsB.includes(stallA.body.stall.id), "exhibitor B must NOT see exhibitor A's stall");
});

test("a pure exhibitor with a confirmed, paid stall sees it via participations (Stalls page data source)", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stalls-confirmed", ts);
  organizerIds.push(org.organizerId);
  const ex = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "stalls-confirmed-ex", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, ex.participationId);
  const stall = await createStall(baseUrl, org.token, org.firstExhibitionId, 4500);
  await selectStall(baseUrl, ex.token, ex.participationId, stall.body.stall.id);
  const pay = await initiatePayment(baseUrl, ex.token, ex.participationId);
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  await mockComplete(baseUrl, ex.token, pay.body.payment.id, "success");

  const res = await fetch(`${baseUrl}/api/exhibitor/participations`, { headers: { Authorization: `Bearer ${ex.token}` } });
  const body = await res.json();
  const participation = body.participations.find((p: { id: string }) => p.id === ex.participationId);
  assert.equal(participation.status, "confirmed");
  assert.equal(participation.stalls[0].id, stall.body.stall.id);
  assert.equal(participation.stalls[0].status, "sold");
});

// -------- P2-2: Organizer Exhibitors KPI correctness --------

test("dashboard confirmedExhibitors counts only confirmed participations, totalExhibitorsAllStatuses counts every status", async () => {
  const org = await bootstrapOrganizer(baseUrl, "kpi-exhibitors", ts);
  organizerIds.push(org.organizerId);

  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "kpi-applied", ts);
  void applied;
  const approvedOnly = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "kpi-approved", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, approvedOnly.participationId);
  const confirmed = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "kpi-confirmed", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, confirmed.participationId);
  await prisma.exhibitionExhibitor.update({ where: { id: confirmed.participationId }, data: { status: "confirmed" } });

  const res = await fetch(`${baseUrl}/api/organizer/analytics/dashboard`, { headers: { Authorization: `Bearer ${org.token}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.confirmedExhibitors, 1, "only the one truly-confirmed participation should count");
  assert.equal(body.totalExhibitorsAllStatuses, 3, "applied + approved + confirmed must all count toward the total");
});


test("organizer cancellation cannot release reserved or paid exhibitor stalls", async () => {
  const org = await bootstrapOrganizer(baseUrl, "safe-exhibitor-cancellation", ts + 100);
  organizerIds.push(org.organizerId);

  const cancel = (participationId: string) => fetch(
    `${baseUrl}/api/exhibitions/${org.firstExhibitionId}/exhibitors/${participationId}/cancel`,
    { method: "PATCH", headers: { Authorization: `Bearer ${org.token}` } },
  );

  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "cancel-applied", ts + 100);
  const appliedResponse = await cancel(applied.participationId);
  assert.equal(appliedResponse.status, 200, await appliedResponse.text());
  assert.equal((await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: applied.participationId } })).status, "cancelled");

  const approved = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "cancel-approved", ts + 101);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, approved.participationId);
  const approvedResponse = await cancel(approved.participationId);
  assert.equal(approvedResponse.status, 200, await approvedResponse.text());
  assert.equal((await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: approved.participationId } })).status, "cancelled");

  const reserved = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "cancel-reserved", ts + 102);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, reserved.participationId);
  const reservedStall = await createStall(baseUrl, org.token, org.firstExhibitionId, 2100);
  assert.equal((await selectStall(baseUrl, reserved.token, reserved.participationId, reservedStall.body.stall.id)).status, 200);
  const reservedResponse = await cancel(reserved.participationId);
  assert.equal(reservedResponse.status, 409);
  const reservedState = await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: reserved.participationId } });
  assert.equal(reservedState.status, "stall_reserved");
  assert.equal((await prisma.stall.findUniqueOrThrow({ where: { id: reservedStall.body.stall.id } })).status, "reserved");

  const pending = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "cancel-payment-pending", ts + 103);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, pending.participationId);
  const pendingStall = await createStall(baseUrl, org.token, org.firstExhibitionId, 2200);
  assert.equal((await selectStall(baseUrl, pending.token, pending.participationId, pendingStall.body.stall.id)).status, 200);
  const pendingPayment = await initiatePayment(baseUrl, pending.token, pending.participationId);
  assert.equal(pendingPayment.status, 201, JSON.stringify(pendingPayment.body));
  const pendingResponse = await cancel(pending.participationId);
  assert.equal(pendingResponse.status, 409);
  assert.equal((await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: pending.participationId } })).status, "payment_pending");
  assert.equal((await prisma.stall.findUniqueOrThrow({ where: { id: pendingStall.body.stall.id } })).status, "reserved");
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: pendingPayment.body.payment.id } })).status, "created");

  const confirmed = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "cancel-confirmed", ts + 104);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, confirmed.participationId);
  const confirmedStall = await createStall(baseUrl, org.token, org.firstExhibitionId, 2300);
  assert.equal((await selectStall(baseUrl, confirmed.token, confirmed.participationId, confirmedStall.body.stall.id)).status, 200);
  const confirmedPayment = await initiatePayment(baseUrl, confirmed.token, confirmed.participationId);
  assert.equal(confirmedPayment.status, 201, JSON.stringify(confirmedPayment.body));
  const completion = await mockComplete(baseUrl, confirmed.token, confirmedPayment.body.payment.id, "success");
  assert.equal(completion.status, 200, JSON.stringify(completion.body));

  const confirmedResponse = await cancel(confirmed.participationId);
  assert.equal(confirmedResponse.status, 409);
  assert.equal((await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: confirmed.participationId } })).status, "confirmed");
  assert.equal((await prisma.stall.findUniqueOrThrow({ where: { id: confirmedStall.body.stall.id } })).status, "sold");
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: confirmedPayment.body.payment.id } })).status, "paid");
});
