import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { applyAsExhibitor, bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "analytics-isolation-" + label,
    },
    body: JSON.stringify({
      email: "analytics-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Analytics " + label,
      userType: "organizer",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { token: body.token as string, userId: body.user.id as string };
}

test("organizer analytics active count follows canonical Event lifecycle", async () => {
  const owner = await signup("canonical-owner");
  const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: owner.userId, status: "active" } });
  const exhibition = await prisma.exhibition.create({
    data: { ownerId: owner.userId, organizerId: membership.organizerId, name: "Canonical analytics exhibition " + ts, status: "live", visibility: "public" },
  });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId, ownerId: owner.userId, title: "Canonical analytics event " + ts,
      eventType: "EXHIBITION", status: "DRAFT", visibility: "public",
      exhibition: { connect: { id: exhibition.id } },
    },
  });

  const draft = await fetch(baseUrl + "/api/organizer/analytics/dashboard", { headers: { Authorization: "Bearer " + owner.token } });
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).activeExhibitions, 0);

  await prisma.event.update({ where: { id: event.id }, data: { status: "PUBLISHED" } });
  const published = await fetch(baseUrl + "/api/organizer/analytics/dashboard", { headers: { Authorization: "Bearer " + owner.token } });
  assert.equal(published.status, 200);
  assert.equal((await published.json()).activeExhibitions, 1);
});
test("organizer analytics cannot cross tenant boundaries", async () => {
  const owner = await signup("owner");
  const other = await signup("other");

  const ownerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: owner.userId, status: "active" },
  });
  const otherMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: other.userId, status: "active" },
  });
  assert.notEqual(ownerMembership.organizerId, otherMembership.organizerId);

  const exhibition = await prisma.exhibition.create({
    data: {
      ownerId: owner.userId,
      organizerId: ownerMembership.organizerId,
      name: "Analytics isolation " + ts,
      status: "live",
      visibility: "public",
    },
  });

  const event = await prisma.event.create({
    data: {
      organizerId: ownerMembership.organizerId,
      ownerId: owner.userId,
      title: "Analytics event isolation " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
    },
  });

  const dashboard = await fetch(
    baseUrl + "/api/organizer/analytics/dashboard?exhibitionId=" + exhibition.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(dashboard.status, 200);
  const dashboardBody = await dashboard.json();
  assert.equal(dashboardBody.totalExhibitions, 0);
  assert.equal(dashboardBody.totalStalls, 0);
  assert.equal(dashboardBody.totalVisitors, 0);
  assert.equal(dashboardBody.totalLeads, 0);

  const exhibitionDetail = await fetch(
    baseUrl + "/api/organizer/analytics/exhibitions/" + exhibition.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(exhibitionDetail.status, 404);

  const eventAnalytics = await fetch(
    baseUrl + "/api/organizer/event-analytics/" + event.id,
    { headers: { Authorization: "Bearer " + other.token } },
  );
  assert.equal(eventAnalytics.status, 404);
});


test("participant analytics rejects archived events", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "archived-participant-analytics", ts + 3);
  let eventId: string | undefined;

  try {
    const event = await prisma.event.create({
      data: {
        organizerId: owner.organizerId,
        ownerId: owner.userId,
        title: "Archived participant analytics " + ts,
        eventType: "CONFERENCE",
        status: "DRAFT",
        visibility: "public",
        moduleEnablements: {
          create: [
            { moduleType: "ANALYTICS", enabled: true },
            { moduleType: "PARTICIPANTS", enabled: true },
          ],
        },
      },
    });
    eventId = event.id;

    const beforeArchive = await fetch(
      baseUrl + "/api/organizer/event-analytics/" + event.id + "/participants",
      { headers: { Authorization: "Bearer " + owner.token } },
    );
    assert.equal(beforeArchive.status, 200, await beforeArchive.text());

    const archive = await fetch(baseUrl + "/api/events/" + event.id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + owner.token },
    });
    assert.equal(archive.status, 204, await archive.text());

    const afterArchive = await fetch(
      baseUrl + "/api/organizer/event-analytics/" + event.id + "/participants",
      { headers: { Authorization: "Bearer " + owner.token } },
    );
    assert.equal(afterArchive.status, 404, "archived event analytics must not be accessible");
  } finally {
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    await cleanupOrganizers([owner.organizerId]);
  }
});

test("organizer dashboard scopes linked Event revenue and leads to each membership permission", async () => {
  const owner = await signup("mixed-permission-owner");
  const other = await bootstrapOrganizer(baseUrl, "mixed-permission-operations", ts + 20);
  const ownerMembership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: owner.userId, status: "active" },
  });

  let eventId: string | undefined;
  let eventTicketTypeId: string | undefined;
  let reservationId: string | undefined;
  let paymentId: string | undefined;
  let orderId: string | undefined;

  try {
    // This user can view both organizer tenants, but only the first tenant
    // grants payment:view and lead:analytics.
    await prisma.organizerMembership.create({
      data: {
        organizerId: other.organizerId,
        userId: owner.userId,
        role: "operations",
        status: "active",
      },
    });

    const exhibition = await prisma.exhibition.findUniqueOrThrow({
      where: { id: other.firstExhibitionId },
      select: { eventId: true },
    });
    assert.ok(exhibition.eventId, "the second Exhibition must have its canonical linked Event");
    eventId = exhibition.eventId;

    const legacyTicketType = await prisma.ticketType.findFirstOrThrow({
      where: { exhibitionId: other.firstExhibitionId },
    });
    const eventTicketType = await prisma.eventTicketType.create({
      data: {
        eventId,
        legacyTicketTypeId: legacyTicketType.id,
        name: "Permission-scoped ticket",
        price: 100,
        currency: "INR",
        capacity: 10,
        maxPerOrder: 2,
        status: "ACTIVE",
      },
    });
    eventTicketTypeId = eventTicketType.id;

    const reservation = await prisma.eventTicketReservation.create({
      data: {
        eventId,
        eventTicketTypeId,
        userId: owner.userId,
        attendeeName: "Permission Scope Visitor",
        attendeeEmail: `permission-scope-${ts}@example.com`,
        quantity: 1,
        unitPrice: 100,
        currency: "INR",
        status: "CONVERTED",
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    reservationId = reservation.id;

    const pricingVersion = await prisma.pricingVersion.findFirstOrThrow({ where: { active: true } });
    const payment = await prisma.payment.create({
      data: {
        amount: 100,
        baseAmount: 100,
        organizerAmount: 100,
        currency: "INR",
        provider: "test",
        status: "paid",
        pricingVersionId: pricingVersion.id,
      },
    });
    paymentId = payment.id;

    const order = await prisma.eventTicketOrder.create({
      data: {
        eventId,
        reservationId,
        userId: owner.userId,
        paymentId,
        quantity: 1,
        unitPrice: 100,
        subtotal: 100,
        totalAmount: 100,
        currency: "INR",
        status: "PAID",
      },
    });
    orderId = order.id;

    const exhibitor = await applyAsExhibitor(
      baseUrl,
      other.firstExhibitionId,
      "analytics-permission-scope",
      ts + 21,
    );
    const participation = await prisma.exhibitionExhibitor.update({
      where: { id: exhibitor.participationId },
      data: { status: "confirmed" },
    });
    await prisma.lead.create({
      data: {
        exhibitionExhibitorId: participation.id,
        visitorName: "Permission Scope Lead",
        visitorEmail: `permission-lead-${ts}@example.com`,
        capturedByUserId: exhibitor.userId,
      },
    });

    const dashboardResponse = await fetch(baseUrl + "/api/organizer/analytics/dashboard", {
      headers: { Authorization: "Bearer " + owner.token },
    });
    const dashboardText = await dashboardResponse.text();
    assert.equal(dashboardResponse.status, 200, dashboardText);
    const dashboard = JSON.parse(dashboardText) as {
      totalVisitors: number;
      ticketRevenue: number | null;
      totalRevenue: number | null;
      totalLeads: number | null;
    };
    assert.equal(dashboard.totalVisitors, 1, "exhibition:view remains available across both memberships");
    assert.equal(dashboard.ticketRevenue, 0, "linked Event revenue from the operations-only tenant must not leak");
    assert.equal(dashboard.totalRevenue, 0);
    assert.equal(dashboard.totalLeads, 0, "lead analytics from the operations-only tenant must not leak");

    const filteredResponse = await fetch(
      baseUrl + "/api/organizer/analytics/dashboard?exhibitionId=" + other.firstExhibitionId,
      { headers: { Authorization: "Bearer " + owner.token } },
    );
    const filteredText = await filteredResponse.text();
    assert.equal(filteredResponse.status, 200, filteredText);
    const filtered = JSON.parse(filteredText) as {
      totalVisitors: number;
      ticketRevenue: number | null;
      totalRevenue: number | null;
      totalLeads: number | null;
    };
    assert.equal(filtered.totalVisitors, 1);
    assert.equal(filtered.ticketRevenue, null, "a filtered Exhibition without payment:view must hide revenue, not report zero");
    assert.equal(filtered.totalRevenue, null);
    assert.equal(filtered.totalLeads, null, "a filtered Exhibition without lead:analytics must hide lead totals");
  } finally {
    if (orderId) await prisma.eventTicketOrder.deleteMany({ where: { id: orderId } });
    if (reservationId) await prisma.eventTicketReservation.deleteMany({ where: { id: reservationId } });
    if (eventTicketTypeId) await prisma.eventTicketType.deleteMany({ where: { id: eventTicketTypeId } });
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    if (paymentId) await prisma.payment.deleteMany({ where: { id: paymentId } });
    await cleanupOrganizers([ownerMembership.organizerId, other.organizerId]);
  }
});

