import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete } from "./helpers/phase21bFixtures";

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

async function jsonRequest(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function createDraftPlan(token: string, exhibitionId: string, name: string, canvasWidth = 1000, canvasHeight = 700) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name, canvasWidth, canvasHeight }),
  });
  assert.equal(res.status, 201, `plan creation must succeed: ${JSON.stringify(await res.clone().json())}`);
  const body = (await res.json()) as { floorPlan: { id: string } };
  return body.floorPlan.id;
}

async function mapStallOnPlan(token: string, exhibitionId: string, planId: string, stallId: string, extra: Record<string, unknown> = {}) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId, x: 10, y: 10, width: 100, height: 100, ...extra }),
  });
  assert.equal(res.status, 201, `mapping stall must succeed: ${JSON.stringify(await res.clone().json())}`);
}

async function publishPlan(token: string, exhibitionId: string, planId: string) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(res.status, 200, `publish must succeed: ${JSON.stringify(await res.clone().json())}`);
}

async function getFloorPlanAsExhibitor(token: string, participationId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitor/participations/${participationId}/floor-plan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json() };
}

function findObjectForStall(floorPlan: { objects: Array<{ stallId: string; stall: { status: string } | null }> }, stallId: string) {
  return floorPlan.objects.find((o) => o.stallId === stallId);
}

// 1. Full happy path: floor plan reflects real commercial state, not a
// separate/stale copy of it.
test("FP-04: GET floor-plan reflects the same stall row POST /stall mutates", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-happy", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15000);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "Happy Path Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-happy-ex", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);

  const before = await getFloorPlanAsExhibitor(exhibitorToken, participationId);
  assert.equal(before.status, 200);
  const beforeObject = findObjectForStall(before.body.floorPlan, stall.body.stall.id);
  assert.ok(beforeObject, "mapped stall must appear in the floor plan");
  assert.equal(beforeObject!.stall?.status, "available");

  const reserve = await selectStall(baseUrl, exhibitorToken, participationId, stall.body.stall.id);
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));

  const after = await getFloorPlanAsExhibitor(exhibitorToken, participationId);
  assert.equal(after.status, 200);
  const afterObject = findObjectForStall(after.body.floorPlan, stall.body.stall.id);
  assert.ok(afterObject);
  assert.equal(afterObject!.stall?.status, "reserved");
});

// 2. Concurrency guarantee still holds through a floor-plan-mapped stall.
test("FP-04: concurrent reservations of a floor-plan-mapped stall still yield exactly one winner", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-concurrency", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15001);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "Concurrency Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { token: tokenA, participationId: pA } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-conc-a", ts);
  const { token: tokenB, participationId: pB } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-conc-b", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pA);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pB);

  const results = await Promise.all([
    selectStall(baseUrl, tokenA, pA, stall.body.stall.id),
    selectStall(baseUrl, tokenB, pB, stall.body.stall.id),
  ]);
  const statuses = results.map((r) => r.status).sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], "exactly one concurrent reservation of the floor-plan-mapped stall must win");

  const persisted = await prisma.stall.findUnique({ where: { id: stall.body.stall.id } });
  assert.equal(persisted?.status, "reserved");
});

// 3. Unapproved exhibitor can view but not reserve.
test("FP-04: an unapproved (applied) exhibitor can view the floor plan but cannot reserve a stall", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-unapproved", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15002);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "Unapproved Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-unapproved-ex", ts);
  // Deliberately not approved.

  const view = await getFloorPlanAsExhibitor(exhibitorToken, participationId);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.ok(findObjectForStall(view.body.floorPlan, stall.body.stall.id));

  const reserve = await selectStall(baseUrl, exhibitorToken, participationId, stall.body.stall.id);
  assert.equal(reserve.status, 400);
});

// 4. Cross-business IDOR check.
test("FP-04: an exhibitor cannot view the floor plan via another business's participation id", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-idor", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15003);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "IDOR Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { participationId: pA } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-idor-a", ts);
  const { token: tokenB } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-idor-b", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pA);

  // Exhibitor B, authenticated with their own valid token, tries to read the
  // floor plan through exhibitor A's participation id.
  const cross = await getFloorPlanAsExhibitor(tokenB, pA);
  assert.equal(cross.status, 404);
});

// 5. Payment failure does not release the stall; the floor-plan view agrees.
test("FP-04: a failed payment leaves the floor-plan-mapped stall reserved, not available", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-payfail", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15004);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "Payment Fail Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-payfail-ex", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);
  const reserve = await selectStall(baseUrl, exhibitorToken, participationId, stall.body.stall.id);
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));

  const payment = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(payment.status, 201, JSON.stringify(payment.body));

  // Simulate a failed payment outcome via the mock-complete endpoint, the
  // same helper/mechanism phase21b's payment tests use to drive
  // applyPaymentOutcome through a real (test-only) provider callback rather
  // than writing to Payment directly.
  const complete = await mockComplete(baseUrl, exhibitorToken, payment.body.payment.id, "failure");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));

  const view = await getFloorPlanAsExhibitor(exhibitorToken, participationId);
  assert.equal(view.status, 200);
  const object = findObjectForStall(view.body.floorPlan, stall.body.stall.id);
  assert.ok(object);
  assert.equal(object!.stall?.status, "reserved");
  assert.notEqual(object!.stall?.status, "available");
});

// 6. Full settlement is reflected on the map.
test("FP-04: a fully-paid floor-plan-mapped stall shows status sold on the map", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-paid", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15005);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(organizerToken, firstExhibitionId, "Paid Hall");
  await mapStallOnPlan(organizerToken, firstExhibitionId, planId, stall.body.stall.id);
  await publishPlan(organizerToken, firstExhibitionId, planId);

  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase29-paid-ex", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);
  const reserve = await selectStall(baseUrl, exhibitorToken, participationId, stall.body.stall.id);
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));

  const payment = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(payment.status, 201, JSON.stringify(payment.body));

  const complete = await mockComplete(baseUrl, exhibitorToken, payment.body.payment.id, "success");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));

  const view = await getFloorPlanAsExhibitor(exhibitorToken, participationId);
  assert.equal(view.status, 200);
  const object = findObjectForStall(view.body.floorPlan, stall.body.stall.id);
  assert.ok(object);
  assert.equal(object!.stall?.status, "sold");
});
