import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createExhibition, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.floorPlanObject.deleteMany({ where: { floorPlan: { exhibition: { organizerId: { in: organizerIds } } } } });
  await prisma.floorPlan.deleteMany({ where: { exhibition: { organizerId: { in: organizerIds } } } });
  await prisma.ticketBooking.deleteMany({ where: { exhibition: { organizerId: { in: organizerIds } } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("exhibition floor-plan and booking organizer boundaries reject cross-tenant access without mutation", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "a1-resource-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "a1-resource-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  await setSubscription(other.organizerId, "enterprise", "active");

  const created = await createExhibition(baseUrl, owner.token, "A1 Resource Boundary Exhibition", {
    status: "live",
    visibility: "public",
    ticketTypes: [{ name: "A1 Ticket", price: 0, quantity: 10, taxPercent: 0, visible: true }],
    stalls: [{ code: "A1-01", price: 1000, stallType: "standard" }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const exhibitionId = created.body.exhibition.id as string;
  const stallId = created.body.exhibition.stalls[0].id as string;
  const ticketTypeId = created.body.exhibition.ticketTypes[0].id as string;

  const floorPlan = await prisma.floorPlan.create({
    data: {
      exhibitionId,
      name: "A1 Layout",
      canvasWidth: 1000,
      canvasHeight: 600,
    },
  });
  await prisma.floorPlanObject.create({
    data: {
      floorPlanId: floorPlan.id,
      stallId,
      x: 20,
      y: 20,
      width: 100,
      height: 60,
    },
  });

  const booking = await prisma.ticketBooking.create({
    data: {
      exhibitionId,
      ticketTypeId,
      quantity: 1,
      unitPrice: 0,
      amountPaid: 0,
      paymentStatus: "paid",
      attendeeName: "A1 Boundary Visitor",
      attendeeEmail: "a1-boundary@example.com",
    },
  });

  const floorPlanList = await fetch(baseUrl + `/api/exhibitions/${exhibitionId}/floor-plan-layouts`, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(floorPlanList.status, 404);

  const floorPlanDetail = await fetch(baseUrl + `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlan.id}`, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(floorPlanDetail.status, 404);

  const floorPlanUpdate = await fetch(baseUrl + `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlan.id}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1, name: "Hijacked Layout" }),
  });
  assert.equal(floorPlanUpdate.status, 404);

  const floorPlanCreate = await fetch(baseUrl + `/api/exhibitions/${exhibitionId}/floor-plan-layouts`, {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Injected Layout", canvasWidth: 500, canvasHeight: 300 }),
  });
  assert.equal(floorPlanCreate.status, 404);

  const bookingList = await fetch(baseUrl + `/api/bookings/tickets?exhibitionId=${exhibitionId}`, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(bookingList.status, 200);
  const bookingListBody = await bookingList.json();
  assert.equal(bookingListBody.bookings.some((item: { id: string }) => item.id === booking.id), false);

  const bookingLookup = await fetch(baseUrl + `/api/bookings/tickets/lookup/${booking.qrCode}`, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(bookingLookup.status, 404);

  const bookingCheckIn = await fetch(baseUrl + `/api/bookings/tickets/${booking.id}/check-in`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(bookingCheckIn.status, 404);

  const unchanged = await prisma.$transaction([
    prisma.floorPlan.findUniqueOrThrow({ where: { id: floorPlan.id } }),
    prisma.ticketBooking.findUniqueOrThrow({ where: { id: booking.id } }),
  ]);
  assert.equal(unchanged[0].name, "A1 Layout");
  assert.equal(unchanged[0].version, 1);
  assert.equal(unchanged[1].checkInStatus, false);
});
