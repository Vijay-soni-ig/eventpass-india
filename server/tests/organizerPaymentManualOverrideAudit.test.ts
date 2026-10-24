import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const paymentIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (paymentIds.length) await prisma.auditLog.deleteMany({ where: { entityType: "Payment", entityId: { in: paymentIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("manual organizer payment status changes create an audit record", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "manual-payment-audit", ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "manual-payment-audit-exhibitor",
    ts,
  );
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);

  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));

  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  const booking = await prisma.stallBooking.findFirstOrThrow({ where: { paymentId }, select: { id: true } });

  const response = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${organizer.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "paid", gateway: "manual", gatewayRefId: `bank-ref-${ts}` }),
  });
  assert.equal(response.status, 200, await response.clone().text());

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "Payment", entityId: paymentId, action: "payment.status.manually_updated" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(audit, "manual payment status mutation must be auditable");
  assert.equal(audit.actorUserId, organizer.userId);
  const metadata = audit.metadata as Record<string, unknown>;
  assert.equal(metadata.previousStatus, "created");
  assert.equal(metadata.newStatus, "paid");
  assert.equal(metadata.stallBookingId, booking.id);
  assert.equal(metadata.gateway, "manual");
  assert.equal(metadata.gatewayRefId, `bank-ref-${ts}`);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(payment.status, "paid");
});
