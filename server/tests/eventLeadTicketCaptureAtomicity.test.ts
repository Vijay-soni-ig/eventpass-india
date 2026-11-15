import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
let eventId: string | undefined;
let visitorUserId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (eventId) {
    await prisma.eventLead.deleteMany({ where: { eventId } });
    const orders = await prisma.eventTicketOrder.findMany({
      where: { eventId },
      select: { id: true, paymentId: true },
    });
    const orderIds = orders.map((order) => order.id);
    const paymentIds = orders.map((order) => order.paymentId);
    await prisma.eventTicketCheckIn.deleteMany({ where: { eventId } });
    await prisma.eventTicket.deleteMany({ where: { eventId } });
    if (orderIds.length) await prisma.eventTicketOrder.deleteMany({ where: { id: { in: orderIds } } });
    if (paymentIds.length) {
      await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prisma.eventTicketReservation.deleteMany({ where: { eventId } });
    await prisma.eventTicketType.deleteMany({ where: { eventId } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId } });
  }
  await cleanupOrganizers(organizerIds);
  if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
  if (visitorUserId) await prisma.user.deleteMany({ where: { id: visitorUserId } });
  await stop();
  await prisma.$disconnect();
});

test("ticket lead capture uses attendee details re-read inside the authorized write transaction", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "ticket-lead-atomicity-" + ts, ts);
  organizerIds.push(organizer.organizerId);
  await setSubscription(organizer.organizerId, "enterprise", "active");

  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: organizer.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(exhibition.eventId, "exhibition must be linked to its canonical event");
  eventId = exhibition.eventId;

  // Backfilled canonical Events default to DRAFT; ticket checkout requires publication.
  await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED" } });

  const exhibitor = await signupUser(
    baseUrl,
    "ticket-lead-exhibitor-" + ts + "@example.com",
    "Ticket Lead Exhibitor",
    "exhibitor",
  );
  const application = await fetch(baseUrl + "/api/exhibitor/participations", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({ exhibitionId: organizer.firstExhibitionId }),
  });
  const applicationBody = await application.json() as { participation?: { id: string } };
  assert.equal(application.status, 201, JSON.stringify(applicationBody));
  assert.ok(applicationBody.participation?.id);

  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: exhibitor.userId },
    select: { id: true },
  });
  await prisma.exhibitionExhibitor.update({
    where: { id: applicationBody.participation.id },
    data: { status: "confirmed" },
  });
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId, moduleType: "LEADS" } },
    create: { eventId, moduleType: "LEADS", enabled: true },
    update: { enabled: true },
  });
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId, moduleType: "TICKETING" } },
    create: { eventId, moduleType: "TICKETING", enabled: true },
    update: { enabled: true },
  });

  const visitor = await signupUser(
    baseUrl,
    "ticket-lead-visitor-" + ts + "@example.com",
    "Original Ticket Attendee",
    "visitor",
  );
  visitorUserId = visitor.userId;
  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId,
      name: "Ticket Lead Capture",
      price: 500,
      currency: "INR",
      capacity: 5,
      maxPerOrder: 2,
      status: "ACTIVE",
    },
  });
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId,
      eventTicketTypeId: ticketType.id,
      userId: visitor.userId,
      attendeeName: "Original Ticket Attendee",
      attendeeEmail: "original-attendee-" + ts + "@example.com",
      attendeePhone: "9876543210",
      quantity: 1,
      unitPrice: 500,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const orderResponse = await fetch(baseUrl + "/api/event-ticket-orders", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId: reservation.id }),
  });
  const orderBody = await orderResponse.json() as { payment?: { id: string } };
  assert.equal(orderResponse.status, 201, JSON.stringify(orderBody));
  assert.ok(orderBody.payment?.id);

  const paymentCompletion = await fetch(baseUrl + "/api/payments/" + orderBody.payment.id + "/mock-complete", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(paymentCompletion.status, 200, await paymentCompletion.text());

  const ticket = await prisma.eventTicket.findFirstOrThrow({
    where: { eventId, userId: visitor.userId },
    select: { id: true },
  });
  await prisma.eventTicket.update({ where: { id: ticket.id }, data: { status: "USED" } });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  let attendeeChangedBeforeTransaction = false;
  client.$transaction = (async (...args: unknown[]) => {
    if (!attendeeChangedBeforeTransaction) {
      attendeeChangedBeforeTransaction = true;
      await prisma.eventTicket.update({
        where: { id: ticket.id },
        data: {
          attendeeName: "Updated Ticket Attendee",
          attendeeEmail: "updated-attendee-" + ts + "@example.com",
          attendeePhone: "9123456789",
        },
      });
    }
    return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
  }) as typeof client.$transaction;

  let response: Response | undefined;
  try {
    response = await fetch(baseUrl + "/api/event-leads/from-ticket", {
      method: "POST",
      headers: { Authorization: "Bearer " + exhibitor.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        ticketId: ticket.id,
        exhibitorBusinessId: business.id,
      }),
    });
  } finally {
    client.$transaction = originalTransaction;
  }

  assert.ok(response, "lead capture request must return a response");
  const responseBody = await response.json() as {
    lead?: { visitorName: string; visitorEmail: string | null; visitorPhone: string | null; visitorUserId: string | null };
  };
  assert.equal(response.status, 201, JSON.stringify(responseBody));
  assert.equal(attendeeChangedBeforeTransaction, true, "the race window must be exercised");
  assert.equal(responseBody.lead?.visitorName, "Updated Ticket Attendee");
  assert.equal(responseBody.lead?.visitorEmail, "updated-attendee-" + ts + "@example.com");
  assert.equal(responseBody.lead?.visitorPhone, "9123456789");
  assert.equal(responseBody.lead?.visitorUserId, visitor.userId);
});
