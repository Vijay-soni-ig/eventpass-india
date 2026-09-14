import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete, cleanupOrphanPayments } from "./helpers/phase21bFixtures";
import { RESERVATION_EXPIRY_MS } from "../src/lib/stallReservationExpiry";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

// The PUBLIC exhibition endpoint only ever returns status:"available" stalls
// (see server/src/routes/public.ts) — a reserved/sold stall simply wouldn't
// appear in its list at all, which would make every assertion below that
// checks for "reserved"/"sold" silently find nothing rather than fail
// loudly. Reading through the ORGANIZER endpoint instead (which returns
// every stall regardless of status, and which FP-05 also wires expiry
// release into) gives an unambiguous status for every stall in every state.
async function getExhibition(organizerToken: string, exhibitionId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, { headers: { Authorization: `Bearer ${organizerToken}` } });
  const body = await res.json();
  return { status: res.status, body };
}

function stallStatus(body: { exhibition: { stalls: Array<{ id: string; status: string }> } }, stallId: string) {
  const stall = body.exhibition.stalls.find((s) => s.id === stallId);
  assert.ok(stall, `stall ${stallId} must always be present in the organizer's own exhibition view`);
  return stall.status;
}

async function participationStatus(token: string, participationId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitor/participations`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  return (body.participations as Array<{ id: string; status: string }>).find((p) => p.id === participationId)?.status;
}

/** Backdates a stall's reservedAt past the expiry window, simulating an abandoned reservation without waiting a real hour. */
async function backdateReservation(stallId: string) {
  await prisma.stall.update({
    where: { id: stallId },
    data: { reservedAt: new Date(Date.now() - RESERVATION_EXPIRY_MS - 60_000) },
  });
}

test("reservation expiry: an expired reservation is released on read, and the participation reverts to approved", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-read-release", ts);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15000);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-read-release-x", ts);
  const approve = await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  assert.equal(approve.status, 200);

  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200, JSON.stringify(select.body));

  // Sanity: freshly reserved, not yet expired — a read must NOT release it.
  const fresh = await getExhibition(organizerToken, firstExhibitionId);
  assert.equal(stallStatus(fresh.body, stallId), "reserved");

  await backdateReservation(stallId);

  const afterExpiry = await getExhibition(organizerToken, firstExhibitionId);
  assert.equal(stallStatus(afterExpiry.body, stallId), "available", "an expired reservation must show as available on the next read");

  const status = await participationStatus(exhibitor.token, exhibitor.participationId);
  assert.equal(status, "approved", "the participation must revert from stall_reserved to approved once its reservation expires");

  const auditCount = await prisma.auditLog.count({ where: { action: "stall.reservation_expired", entityId: stallId } });
  assert.equal(auditCount, 1, "exactly one audit entry must be recorded for this expiry");
});

test("reservation expiry: an expired reservation is atomically reclaimed by a different exhibitor's selection", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-reclaim", ts + 1);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15001);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitorA = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-reclaim-a", ts + 1);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitorA.participationId);
  const selectA = await selectStall(baseUrl, exhibitorA.token, exhibitorA.participationId, stallId);
  assert.equal(selectA.status, 200);

  await backdateReservation(stallId);

  const exhibitorB = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-reclaim-b", ts + 1);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitorB.participationId);
  const selectB = await selectStall(baseUrl, exhibitorB.token, exhibitorB.participationId, stallId);
  assert.equal(selectB.status, 200, JSON.stringify(selectB.body));

  const statusA = await participationStatus(exhibitorA.token, exhibitorA.participationId);
  assert.equal(statusA, "approved", "the original holder must revert to approved when their expired reservation is reclaimed");
  const statusB = await participationStatus(exhibitorB.token, exhibitorB.participationId);
  assert.equal(statusB, "stall_reserved", "the new claimant must now hold the reservation");

  const final = await getExhibition(organizerToken, firstExhibitionId);
  assert.equal(stallStatus(final.body, stallId), "reserved");
});

test("reservation expiry: a reservation within the window is untouched and blocks other claimants", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-fresh", ts + 2);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15002);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitorA = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-fresh-a", ts + 2);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitorA.participationId);
  const selectA = await selectStall(baseUrl, exhibitorA.token, exhibitorA.participationId, stallId);
  assert.equal(selectA.status, 200);

  const exhibitorB = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-fresh-b", ts + 2);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitorB.participationId);
  const selectB = await selectStall(baseUrl, exhibitorB.token, exhibitorB.participationId, stallId);
  assert.equal(selectB.status, 409, "a stall reserved well within the expiry window must not be claimable by anyone else");
});

test("reservation expiry: a participation actively in payment_pending is never expired, even with a stale reservedAt", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-payment-pending", ts + 3);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15003);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-payment-pending-x", ts + 3);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200);

  const payment = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(payment.status, 201, JSON.stringify(payment.body));

  // The reservation clock started well before the payment window's own
  // staleness rules — simulate that by backdating reservedAt directly, the
  // way a real long-idle-then-suddenly-active exhibitor might.
  await backdateReservation(stallId);

  const duringPayment = await getExhibition(organizerToken, firstExhibitionId);
  assert.equal(
    stallStatus(duringPayment.body, stallId),
    "reserved",
    "a stall must never be released to available while its participation is actively payment_pending, regardless of reservedAt age"
  );
  const status = await participationStatus(exhibitor.token, exhibitor.participationId);
  assert.equal(status, "payment_pending");

  // Clean up: settle the payment so this test doesn't leave a dangling order.
  await mockComplete(baseUrl, exhibitor.token, payment.body.payment.id, "success");
});

test("reservation expiry: payment-vs-expiry race — concurrent payment initiation and an expiry-triggering read never both win", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-race", ts + 4);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15004);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-race-x", ts + 4);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200);

  // Eligible for expiry right as we race a payment-initiation attempt
  // against a read that triggers the expiry sweep for the same exhibition —
  // this is the exact race stallReservationExpiry.ts's row lock exists to
  // close (see its file-level comment).
  await backdateReservation(stallId);

  const [paymentResult, readResult] = await Promise.all([
    initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId),
    getExhibition(organizerToken, firstExhibitionId),
  ]);

  // Whichever side of the race actually won the row lock, the two systems
  // of record (Stall.status/reservedAt and ExhibitionExhibitor.status) must
  // end up in exactly one of two fully consistent states — never a mix
  // (e.g. payment succeeding while the stall was independently released).
  const finalParticipationStatus = await participationStatus(exhibitor.token, exhibitor.participationId);
  const finalExhibition = await getExhibition(organizerToken, firstExhibitionId);
  const finalStallStatus = stallStatus(finalExhibition.body, stallId);

  if (paymentResult.status === 201) {
    assert.equal(finalParticipationStatus, "payment_pending", "if payment initiation won the race, the participation must be payment_pending");
    assert.equal(finalStallStatus, "reserved", "if payment initiation won the race, the stall must remain reserved for it — never released out from under an active payment attempt");
    // Clean up the payment this branch opened.
    await mockComplete(baseUrl, exhibitor.token, paymentResult.body.payment.id, "success");
  } else {
    assert.equal(paymentResult.status, 409, JSON.stringify(paymentResult.body));
    assert.equal(finalParticipationStatus, "approved", "if expiry won the race, the participation must have reverted to approved");
    assert.equal(finalStallStatus, "available", "if expiry won the race, the stall must be available for someone else");
  }

  // Regardless of which side won, the read fired in parallel must never
  // itself have errored or produced an inconsistent shape.
  assert.equal(readResult.status, 200);

  const auditCount = await prisma.auditLog.count({ where: { action: "stall.reservation_expired", entityId: stallId } });
  assert.ok(auditCount <= 1, "the race must never produce more than one expiry audit entry for the same stall");
});

test("reservation expiry: idempotent — two concurrent reads of an expired reservation never double-process it", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-idempotent", ts + 5);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15005);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-idempotent-x", ts + 5);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200);

  await backdateReservation(stallId);

  const [first, second] = await Promise.all([getExhibition(organizerToken, firstExhibitionId), getExhibition(organizerToken, firstExhibitionId)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(stallStatus(first.body, stallId), "available");
  assert.equal(stallStatus(second.body, stallId), "available");

  const auditCount = await prisma.auditLog.count({ where: { action: "stall.reservation_expired", entityId: stallId } });
  assert.equal(auditCount, 1, "concurrent reads of the same expired reservation must produce exactly one expiry, not one per reader");
});

test("reservation expiry: regression — a normal reserve-then-pay-then-confirm flow with no expiry involved still works", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase30-regression", ts + 6);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 15006);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase30-regression-x", ts + 6);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200);

  const payment = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(payment.status, 201);
  const complete = await mockComplete(baseUrl, exhibitor.token, payment.body.payment.id, "success");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));

  const status = await participationStatus(exhibitor.token, exhibitor.participationId);
  assert.equal(status, "confirmed");
  const final = await getExhibition(organizerToken, firstExhibitionId);
  assert.equal(stallStatus(final.body, stallId), "sold");
});
