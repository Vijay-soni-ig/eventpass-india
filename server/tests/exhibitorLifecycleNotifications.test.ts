import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete } from "./helpers/phase21bFixtures";
import { processOneIntent, processOneDelivery } from "../src/lib/notificationDispatcher";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const intentIds: string[] = [];
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });

after(async () => {
  for (const intentId of intentIds) {
    await prisma.$executeRaw`DELETE FROM notification_deliveries WHERE intent_id = ${intentId}`;
    await prisma.$executeRaw`DELETE FROM notification_intents WHERE id = ${intentId}`;
  }
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function findIntent(idempotencyKey: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; event_type: string; status: string }>>`
    SELECT id, event_type, status FROM notification_intents WHERE idempotency_key = ${idempotencyKey}
  `;
  if (rows[0]) intentIds.push(rows[0].id);
  return rows[0] ?? null;
}

async function dispatchIntent(intentId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM notification_intents WHERE id = ${intentId}`;
    if (rows[0]?.status === "COMPLETED" || rows[0]?.status === "DEAD_LETTER") break;
    await processOneIntent("exh05a-test-worker");
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM notification_deliveries WHERE intent_id = ${intentId}`;
    if (rows.length > 0 && rows.every((row) => ["SENT", "FAILED", "SUPPRESSED", "CANCELLED"].includes(row.status))) break;
    await processOneDelivery("exh05a-test-worker");
  }
  const intent = await prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM notification_intents WHERE id = ${intentId}`;
  const deliveries = await prisma.$queryRaw<Array<{ status: string; recipient_user_id: string }>>`
    SELECT status, recipient_user_id FROM notification_deliveries WHERE intent_id = ${intentId}
  `;
  assert.equal(intent[0]?.status, "COMPLETED", "intent must be expanded successfully");
  assert.ok(deliveries.length > 0, "intent must resolve authorized recipients");
  assert.ok(deliveries.every((delivery) => delivery.status === "SENT"), "in-app delivery must be sent");
  return deliveries;
}

test("EXH-05A: application submission and review notify the correct personas exactly once", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh05a-application", ts);
  organizerIds.push(organizer.organizerId);
  const operationsSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `exh05a-operations-${ts}@example.com`, password: "TestPassword123!", fullName: "EXH-05A Operations Member", userType: "visitor" }),
  }).then((response) => response.json());
  assert.ok(operationsSignup.user?.id, "operations test user must be created");
  await prisma.organizerMembership.create({
    data: { organizerId: organizer.organizerId, userId: operationsSignup.user.id, role: "operations", status: "active" },
  });
  const exhibitor = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh05a-applicant", ts);

  const submitted = await findIntent(`exhibitor-application:${exhibitor.participationId}:submitted:v1`);
  assert.ok(submitted, "application creation must enqueue within its transaction");
  assert.equal(submitted.event_type, "EXHIBITOR_APPLICATION_SUBMITTED");
  const submittedDeliveries = await dispatchIntent(submitted.id);
  assert.deepEqual(
    submittedDeliveries.map((row) => row.recipient_user_id).sort(),
    [organizer.userId, operationsSignup.user.id].sort(),
    "application notifications must reach all active organizer roles with manage permission",
  );
  assert.ok(await prisma.notification.findFirst({ where: { userId: organizer.userId, type: "EXHIBITOR_APPLICATION_SUBMITTED", entityId: exhibitor.participationId, sourceVersion: submitted.id } }));

  const approved = await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const reviewed = await findIntent(`exhibitor-application:${exhibitor.participationId}:reviewed:approved:v1`);
  assert.ok(reviewed, "successful approval must enqueue an exhibitor notification");
  assert.equal(reviewed.event_type, "EXHIBITOR_APPLICATION_APPROVED");
  const reviewedDeliveries = await dispatchIntent(reviewed.id);
  assert.deepEqual(reviewedDeliveries.map((row) => row.recipient_user_id), [exhibitor.userId]);
  assert.ok(await prisma.notification.findFirst({ where: { userId: exhibitor.userId, type: "EXHIBITOR_APPLICATION_APPROVED", entityId: exhibitor.participationId, sourceVersion: reviewed.id } }));

  const duplicateReview = await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  assert.notEqual(duplicateReview.status, 200, "repeated review is not a new transition");
  const count = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM notification_intents
    WHERE entity_id = ${exhibitor.participationId}
      AND event_type IN ('EXHIBITOR_APPLICATION_APPROVED', 'EXHIBITOR_APPLICATION_REJECTED')
  `;
  assert.equal(Number(count[0].count), 1, "only the winning review creates a decision notification");

  const rejectedApplicant = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh05a-rejected-applicant", ts + 2);
  const rejectedResponse = await fetch(`${baseUrl}/api/exhibitions/${organizer.firstExhibitionId}/exhibitors/${rejectedApplicant.participationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizer.token}` },
    body: JSON.stringify({ status: "rejected" }),
  });
  const rejectedBody = await rejectedResponse.json();
  assert.equal(rejectedResponse.status, 200, JSON.stringify(rejectedBody));
  const rejectionIntent = await findIntent(`exhibitor-application:${rejectedApplicant.participationId}:reviewed:rejected:v1`);
  assert.ok(rejectionIntent, "successful rejection must enqueue an exhibitor notification");
  assert.equal(rejectionIntent.event_type, "EXHIBITOR_APPLICATION_REJECTED");
  const rejectionDeliveries = await dispatchIntent(rejectionIntent.id);
  assert.deepEqual(rejectionDeliveries.map((row) => row.recipient_user_id), [rejectedApplicant.userId]);
  assert.ok(await prisma.notification.findFirst({ where: { userId: rejectedApplicant.userId, type: "EXHIBITOR_APPLICATION_REJECTED", entityId: rejectedApplicant.participationId, sourceVersion: rejectionIntent.id } }));
});

test("EXH-05A: verified failed and successful stall payments notify after committed lifecycle transitions", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh05a-payment", ts + 1);
  organizerIds.push(organizer.organizerId);
  const exhibitor = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh05a-payee", ts + 1);
  const approval = await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 4000);
  assert.equal(stall.status, 201, JSON.stringify(stall.body));
  const reserved = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(reserved.status, 200, JSON.stringify(reserved.body));

  const firstPayment = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(firstPayment.status, 201, JSON.stringify(firstPayment.body));
  const failed = await mockComplete(baseUrl, exhibitor.token, firstPayment.body.payment.id, "failure");
  assert.equal(failed.status, 200, JSON.stringify(failed.body));
  const failureIntent = await findIntent(`stall-payment:${firstPayment.body.payment.id}:failed:v1`);
  assert.ok(failureIntent, "verified failure and payment_pending rollback must enqueue");
  assert.equal(failureIntent.event_type, "STALL_PAYMENT_FAILED");
  const failedDeliveries = await dispatchIntent(failureIntent.id);
  assert.deepEqual(failedDeliveries.map((row) => row.recipient_user_id), [exhibitor.userId]);

  const retryPayment = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(retryPayment.status, 201, JSON.stringify(retryPayment.body));
  const paid = await mockComplete(baseUrl, exhibitor.token, retryPayment.body.payment.id, "success");
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  const confirmedIntent = await findIntent(`stall-payment:${retryPayment.body.payment.id}:confirmed:v1`);
  assert.ok(confirmedIntent, "verified paid outcome that confirms the stall must enqueue");
  assert.equal(confirmedIntent.event_type, "STALL_BOOKING_CONFIRMED");
  const confirmedDeliveries = await dispatchIntent(confirmedIntent.id);
  assert.deepEqual(confirmedDeliveries.map((row) => row.recipient_user_id), [exhibitor.userId]);
  assert.ok(await prisma.notification.findFirst({ where: { userId: exhibitor.userId, type: "STALL_BOOKING_CONFIRMED", entityId: exhibitor.participationId, sourceVersion: confirmedIntent.id } }));
});
