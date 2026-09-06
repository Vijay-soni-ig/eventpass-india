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

// Test — P0-2 fix: GET /api/exhibitor/participations/payments (the new
// "Sales" data source) returns only the caller's own exhibitor business's
// stall payments, never another business's.
test("GET /api/exhibitor/participations/payments returns only the caller's own stall payments", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "endpoints-payments", ts);
  organizerIds.push(organizerId);

  const { token: exhibitorAToken, participationId: pA } = await applyAsExhibitor(baseUrl, firstExhibitionId, "endpoints-a", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pA);
  const stallA = await createStall(baseUrl, organizerToken, firstExhibitionId, 3000);
  await selectStall(baseUrl, exhibitorAToken, pA, stallA.body.stall.id);
  const paymentA = await initiatePayment(baseUrl, exhibitorAToken, pA);
  assert.equal(paymentA.status, 201, JSON.stringify(paymentA.body));
  await mockComplete(baseUrl, exhibitorAToken, paymentA.body.payment.id, "success");

  const { token: exhibitorBToken, participationId: pB } = await applyAsExhibitor(baseUrl, firstExhibitionId, "endpoints-b", ts);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, pB);
  const stallB = await createStall(baseUrl, organizerToken, firstExhibitionId, 5000);
  await selectStall(baseUrl, exhibitorBToken, pB, stallB.body.stall.id);
  const paymentB = await initiatePayment(baseUrl, exhibitorBToken, pB);
  assert.equal(paymentB.status, 201, JSON.stringify(paymentB.body));

  const resA = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, { headers: { Authorization: `Bearer ${exhibitorAToken}` } });
  const bodyA = await resA.json();
  assert.equal(resA.status, 200, JSON.stringify(bodyA));
  assert.equal(bodyA.bookings.length, 1, "exhibitor A must see only their own stall booking");
  assert.equal(bodyA.bookings[0].exhibitionExhibitorId, pA);
  assert.equal(Number(bodyA.bookings[0].amountPaid), 3000);

  const resB = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, { headers: { Authorization: `Bearer ${exhibitorBToken}` } });
  const bodyB = await resB.json();
  assert.equal(resB.status, 200, JSON.stringify(bodyB));
  assert.equal(bodyB.bookings.length, 1, "exhibitor B must see only their own stall booking, never A's");
  assert.equal(bodyB.bookings[0].exhibitionExhibitorId, pB);
});

// Test — a brand-new exhibitor with no participations at all gets an empty
// list, not an error.
test("GET /api/exhibitor/participations/payments returns an empty list for an exhibitor with no stall payments", async () => {
  const { organizerId, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "endpoints-empty", ts);
  organizerIds.push(organizerId);

  const { token: exhibitorToken } = await applyAsExhibitor(baseUrl, firstExhibitionId, "endpoints-empty-ex", ts);
  const res = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, { headers: { Authorization: `Bearer ${exhibitorToken}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual(body.bookings, []);
});
