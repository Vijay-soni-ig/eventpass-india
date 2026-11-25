import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { buildQrPayload } from "../src/lib/eventTicketIssuance";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const suffix = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
const businessIds: string[] = [];
const paymentIds: string[] = [];
let eventId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventId) {
      await prisma.eventLead.deleteMany({ where: { eventId } });
      await prisma.eventTicketCheckIn.deleteMany({ where: { eventId } });
      await prisma.eventTicket.deleteMany({ where: { eventId } });
      await prisma.eventTicketOrder.deleteMany({ where: { eventId } });
      await prisma.eventTicketReservation.deleteMany({ where: { eventId } });
      await prisma.eventTicketType.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (paymentIds.length) await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    if (businessIds.length) {
      await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
      await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
    }
    await cleanupOrganizers(organizerIds);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function signup(label: string, userType: "exhibitor" | "visitor" = "exhibitor") {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `event-native-lead-${label}-${suffix}`,
    },
    body: JSON.stringify({
      email: `event-native-lead-${label}-${suffix}@example.com`,
      password: "TestPassword123!",
      fullName: `Event Native Lead ${label}`,
      userType,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { token: body.token as string, userId: body.user.id as string };
}

test("standalone Event lead capture resolves checked-in QR tickets and exposes CRM data only to confirmed participants", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "event-native-lead-" + suffix, suffix);
  organizerIds.push(organizer.organizerId);
  await setSubscription(organizer.organizerId, "growth", "active");

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: "Standalone Event Lead Capture " + suffix,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-06-01T00:00:00.000Z"),
      endDate: new Date("2027-06-02T00:00:00.000Z"),
      venue: "Test Venue",
      city: "Test City",
    },
    select: { id: true },
  });
  eventId = event.id;

  for (const moduleType of ["EXHIBITORS", "LEADS"] as const) {
    const enabled = await fetch(baseUrl + `/api/events/${event.id}/modules/${moduleType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
      body: JSON.stringify({ enabled: true }),
    });
    const enabledBody = await enabled.json();
    assert.equal(enabled.status, 200, JSON.stringify(enabledBody));
    assert.equal(enabledBody.module.enabled, true);
  }

  const applicant = await signup("confirmed-applicant");
  const application = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({ eventId: event.id, applicationNote: "Event-native lead capture test" }),
  });
  const applicationBody = await application.json();
  assert.equal(application.status, 201, JSON.stringify(applicationBody));
  const participationId = applicationBody.participation.id as string;
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: applicant.userId },
    select: { id: true },
  });
  businessIds.push(business.id);

  const review = await fetch(baseUrl + `/api/event-exhibitor-participations/events/${event.id}/${participationId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
    body: JSON.stringify({ status: "CONFIRMED", reviewNote: "Approved for lead capture regression" }),
  });
  assert.equal(review.status, 200, await review.text());

  const visitor = await signup("visitor", "visitor");
  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Native Lead Ticket",
      price: 500,
      currency: "INR",
      capacity: 5,
      maxPerOrder: 2,
      status: "ACTIVE",
    },
  });
  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventId: event.id,
      eventTicketTypeId: ticketType.id,
      userId: visitor.userId,
      attendeeName: "Checked In Visitor",
      attendeeEmail: `checked-in-${suffix}@example.com`,
      attendeePhone: "9876543210",
      quantity: 2,
      unitPrice: 500,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  const pricingVersion = await prisma.pricingVersion.findFirstOrThrow({ where: { active: true } });
  const payment = await prisma.payment.create({
    data: {
      amount: 1000,
      baseAmount: 1000,
      organizerAmount: 1000,
      currency: "INR",
      provider: "test",
      status: "paid",
      pricingVersionId: pricingVersion.id,
    },
  });
  paymentIds.push(payment.id);
  const order = await prisma.eventTicketOrder.create({
    data: {
      eventId: event.id,
      reservationId: reservation.id,
      userId: visitor.userId,
      paymentId: payment.id,
      quantity: 2,
      unitPrice: 500,
      subtotal: 1000,
      totalAmount: 1000,
      currency: "INR",
      status: "PAID",
    },
  });

  const usedTicketId = `event-native-lead-used-${suffix}`;
  const usedTicketCode = `ETX-NATIVE-USED-${suffix}`;
  const usedQr = buildQrPayload(usedTicketId, usedTicketCode);
  const usedToken = usedQr.split(".")[2]!;
  const usedTicket = await prisma.eventTicket.create({
    data: {
      id: usedTicketId,
      eventId: event.id,
      eventTicketOrderId: order.id,
      eventTicketTypeId: ticketType.id,
      userId: visitor.userId,
      attendeeName: "Checked In Visitor",
      attendeeEmail: `checked-in-${suffix}@example.com`,
      attendeePhone: "9876543210",
      ticketCode: usedTicketCode,
      qrTokenHash: createHash("sha256").update(usedToken).digest("hex"),
      status: "USED",
      checkedInAt: new Date(),
    },
    select: { id: true },
  });
  const activeTicketId = `event-native-lead-active-${suffix}`;
  const activeTicketCode = `ETX-NATIVE-ACTIVE-${suffix}`;
  const activeQr = buildQrPayload(activeTicketId, activeTicketCode);
  const activeToken = activeQr.split(".")[2]!;
  await prisma.eventTicket.create({
    data: {
      id: activeTicketId,
      eventId: event.id,
      eventTicketOrderId: order.id,
      eventTicketTypeId: ticketType.id,
      userId: visitor.userId,
      attendeeName: "Not Checked In Visitor",
      attendeeEmail: `not-checked-in-${suffix}@example.com`,
      ticketCode: activeTicketCode,
      qrTokenHash: createHash("sha256").update(activeToken).digest("hex"),
      status: "ACTIVE",
    },
  });
  await prisma.eventTicketCheckIn.create({
    data: { eventId: event.id, eventTicketId: usedTicket.id, scannedByUserId: organizer.userId, method: "QR" },
  });

  const contextsResponse = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const contextsBody = await contextsResponse.json();
  assert.equal(contextsResponse.status, 200, JSON.stringify(contextsBody));
  assert.equal(contextsBody.contexts.length, 1);
  assert.equal(contextsBody.contexts[0].eventId, event.id);
  assert.equal(contextsBody.contexts[0].eventExhibitorParticipationId, participationId);
  assert.equal(contextsBody.contexts[0].exhibitionExhibitorId, null);
  assert.deepEqual(contextsBody.contexts[0].stalls, []);

  const resolve = await fetch(baseUrl + "/api/event-leads/capture-contexts/resolve-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({ eventId: event.id, qrPayload: usedQr }),
  });
  const resolved = await resolve.json();
  assert.equal(resolve.status, 200, JSON.stringify(resolved));
  assert.equal(resolved.ticket.id, usedTicket.id);
  assert.equal(resolved.eventExhibitorParticipationId, participationId);
  assert.equal(resolved.exhibitionExhibitorId, null);

  const captureBody = {
    eventId: event.id,
    ticketId: usedTicket.id,
    exhibitorBusinessId: business.id,
    eventExhibitorParticipationId: participationId,
    priority: "HIGH",
    notes: "Standalone Event visitor interest",
  };
  const capture = await fetch(baseUrl + "/api/event-leads/from-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify(captureBody),
  });
  const captured = await capture.json();
  assert.equal(capture.status, 201, JSON.stringify(captured));
  assert.equal(captured.lead.eventExhibitorParticipationId, participationId);
  assert.equal(captured.lead.eventExhibitorParticipation.id, participationId);
  assert.equal(captured.lead.exhibitionExhibitorId, null);

  const manualTicketSource = await fetch(baseUrl + "/api/event-leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({
      eventId: event.id,
      exhibitorBusinessId: business.id,
      eventExhibitorParticipationId: participationId,
      ticketId: usedTicket.id,
      visitorName: "Ticket source must use atomic capture endpoint",
      source: "TICKET_CHECK_IN",
    }),
  });
  assert.equal(manualTicketSource.status, 400, await manualTicketSource.text());

  const duplicate = await fetch(baseUrl + "/api/event-leads/from-ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify(captureBody),
  });
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 200, JSON.stringify(duplicateBody));
  assert.equal(duplicateBody.duplicate, true);

  const leadsResponse = await fetch(baseUrl + `/api/event-leads?eventId=${event.id}&exhibitorBusinessId=${business.id}`, {
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const leadsBody = await leadsResponse.json();
  assert.equal(leadsResponse.status, 200, JSON.stringify(leadsBody));
  assert.equal(leadsBody.pagination.total, 1);
  assert.equal(leadsBody.leads[0].eventExhibitorParticipation.id, participationId);

  const analytics = await fetch(baseUrl + `/api/event-leads/analytics?exhibitorBusinessId=${business.id}`, {
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const analyticsBody = await analytics.json();
  assert.equal(analytics.status, 200, JSON.stringify(analyticsBody));
  assert.equal(analyticsBody.totalLeads, 1);

  const exportResponse = await fetch(baseUrl + `/api/event-leads/export?exhibitorBusinessId=${business.id}`, {
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const exportCsv = await exportResponse.text();
  assert.equal(exportResponse.status, 200, exportCsv);
  assert.match(exportCsv, /Checked In Visitor/);

  const activeResolve = await fetch(baseUrl + "/api/event-leads/capture-contexts/resolve-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({ eventId: event.id, qrPayload: activeQr }),
  });
  assert.equal(activeResolve.status, 409, await activeResolve.text());

  const unconfirmed = await signup("unconfirmed-applicant");
  const unconfirmedApply = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + unconfirmed.token },
    body: JSON.stringify({ eventId: event.id }),
  });
  assert.equal(unconfirmedApply.status, 201, await unconfirmedApply.text());
  const unconfirmedBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: unconfirmed.userId },
    select: { id: true },
  });
  businessIds.push(unconfirmedBusiness.id);

  const unconfirmedResolve = await fetch(baseUrl + "/api/event-leads/capture-contexts/resolve-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + unconfirmed.token },
    body: JSON.stringify({ eventId: event.id, qrPayload: usedQr }),
  });
  assert.equal(unconfirmedResolve.status, 403, await unconfirmedResolve.text());
  const unconfirmedContexts = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
    headers: { Authorization: "Bearer " + unconfirmed.token },
  });
  assert.deepEqual((await unconfirmedContexts.json()).contexts, []);
});
