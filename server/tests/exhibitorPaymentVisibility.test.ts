import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser, selectStall, initiatePayment, mockComplete } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const extraUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("exhibitor payment history is limited to owner and admin roles", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "payment-visibility", ts);
  organizerIds.push(organizer.organizerId);

  const owner = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "payment-visibility-owner", ts);
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, owner.participationId);
  const business = await prisma.exhibitorBusiness.findFirstOrThrow({
    where: { ownerId: owner.userId },
    select: { id: true },
  });

  const staff = await signupUser(baseUrl, `payment-visibility-staff-${ts}@example.com`, "Payment Visibility Staff", "exhibitor");
  const admin = await signupUser(baseUrl, `payment-visibility-admin-${ts}@example.com`, "Payment Visibility Admin", "exhibitor");
  extraUserIds.push(staff.userId, admin.userId);
  await prisma.exhibitorMembership.createMany({
    data: [
      { exhibitorBusinessId: business.id, userId: staff.userId, invitedEmail: `payment-visibility-staff-${ts}@example.com`, role: "staff", status: "active" },
      { exhibitorBusinessId: business.id, userId: admin.userId, invitedEmail: `payment-visibility-admin-${ts}@example.com`, role: "admin", status: "active" },
    ],
  });

  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 3500);
  const reservation = await selectStall(baseUrl, owner.token, owner.participationId, stall.body.stall.id);
  assert.equal(reservation.status, 200, JSON.stringify(reservation.body));
  const payment = await initiatePayment(baseUrl, owner.token, owner.participationId);
  assert.equal(payment.status, 201, JSON.stringify(payment.body));

  const pendingSummaryResponse = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const pendingSummary = await pendingSummaryResponse.json();
  assert.equal(pendingSummaryResponse.status, 200, JSON.stringify(pendingSummary));
  assert.equal(pendingSummary.summary.grossPaid, 0, "a created payment must not count as money collected");
  assert.equal(pendingSummary.summary.netSpend, 0);
  assert.equal(pendingSummary.summary.pendingAmount, 3500);

  const settled = await mockComplete(baseUrl, owner.token, payment.body.payment.id, "success");
  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  const paidSummaryResponse = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, {
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  const paidSummary = await paidSummaryResponse.json();
  assert.equal(paidSummaryResponse.status, 200, JSON.stringify(paidSummary));
  assert.equal(paidSummary.summary.grossPaid, 3500);
  assert.equal(paidSummary.summary.netSpend, 3500);
  assert.equal(paidSummary.summary.pendingAmount, 0);

  const endpoints = [
    `/api/exhibitor/participations/payments`,
    `/api/exhibitor/participations/${owner.participationId}/payments`,
  ];

  for (const [index, endpoint] of endpoints.entries()) {
    const ownerResponse = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(ownerResponse.status, 200, `owner should read ${endpoint}`);
    const ownerBody = await ownerResponse.json();
    assert.ok(ownerBody.bookings.length > 0);

    const adminResponse = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminResponse.status, 200, `admin should read ${endpoint}`);
    const adminBody = await adminResponse.json();
    assert.ok(adminBody.bookings.length > 0);

    const staffResponse = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${staff.token}` },
    });
    assert.equal(staffResponse.status, index === 0 ? 403 : 404, `staff must not read ${endpoint}`);
  }
});
