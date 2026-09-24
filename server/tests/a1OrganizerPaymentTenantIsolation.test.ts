import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createExhibition, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.ticketBooking.deleteMany({ where: { exhibition: { organizerId: { in: organizerIds } } } });
  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { ticketBooking: { exhibition: { organizerId: { in: organizerIds } } } },
        { stallBooking: { exhibition: { organizerId: { in: organizerIds } } } },
      ],
    },
    select: { id: true },
  });
  if (payments.length) await prisma.payment.deleteMany({ where: { id: { in: payments.map((p) => p.id) } } });
  if (visitorUserIds.length) await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("organizer payment reads and refund mutations remain tenant-scoped", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "a1-payment-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "a1-payment-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  await setSubscription(other.organizerId, "enterprise", "active");

  const created = await createExhibition(baseUrl, owner.token, "A1 Payment Boundary Exhibition", {
    status: "live",
    visibility: "public",
    startDate: "2030-02-01",
    endDate: "2030-02-02",
    venue: "A1 Payment Venue",
    city: "A1 Payment City",
    ticketTypes: [{ name: "Free A1 Ticket", price: 0, quantity: 10, taxPercent: 0, visible: true }],
    stalls: [],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const exhibitionId = created.body.exhibition.id as string;
  const ticketTypeId = created.body.exhibition.ticketTypes[0].id as string;
  const visitorEmail = "a1-payment-" + ts + "@example.com";
  const visitor = await signupUser(baseUrl, visitorEmail, "A1 Payment Visitor", "visitor");
  visitorUserIds.push(visitor.userId);

  const bookingResponse = await fetch(baseUrl + "/api/bookings/tickets", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      exhibitionId,
      ticketTypeId,
      attendeeName: "A1 Payment Visitor",
      attendeeEmail: visitorEmail,
      quantity: 1,
    }),
  });
  const bookingBody = await bookingResponse.json();
  assert.equal(bookingResponse.status, 201, JSON.stringify(bookingBody));
  const paymentId = bookingBody.payment.id as string;

  const detail = await fetch(baseUrl + "/api/organizer/payments/" + paymentId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(detail.status, 404);

  const refunds = await fetch(baseUrl + "/api/organizer/payments/" + paymentId + "/refunds", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(refunds.status, 404);

  const list = await fetch(baseUrl + "/api/organizer/payments?exhibitionId=" + exhibitionId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.ticketBookings.some((booking: { paymentId: string | null }) => booking.paymentId === paymentId), false);
  assert.equal(listBody.bookings.some((booking: { paymentId: string | null }) => booking.paymentId === paymentId), false);

  const refund = await fetch(baseUrl + "/api/organizer/payments/" + paymentId + "/refund", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "CUSTOMER_REQUEST", idempotencyKey: "a1-cross-tenant-" + ts }),
  });
  assert.equal(refund.status, 404);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(payment.status, "paid");
  assert.equal(Number(payment.refundedAmount), 0);
});
