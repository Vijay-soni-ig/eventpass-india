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
  if (visitorUserIds.length) await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
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
    startDate: "2030-01-01",
    endDate: "2030-01-02",
    venue: "A1 Venue",
    city: "A1 City",
    ticketTypes: [{ name: "A1 Ticket", price: 0, quantity: 10, taxPercent: 0, visible: true }],
    stalls: [{ code: "A1-01", price: 1000, stallType: "standard" }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const exhibitionId = created.body.exhibition.id as string;
  const ticketTypeId = created.body.exhibition.ticketTypes[0].id as string;

  // Floor-plan IDs are deliberately synthetic here. The authorization boundary
  // is checked against the exhibition before any floor-plan lookup, so a
  // cross-tenant caller must receive 404 even when a real floor-plan id is known.
  const floorPlanId = "00000000-0000-0000-0000-000000000001";

  const floorPlanList = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/floor-plan-layouts", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(floorPlanList.status, 404);

  const floorPlanDetail = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/floor-plan-layouts/" + floorPlanId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(floorPlanDetail.status, 404);

  const floorPlanUpdate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/floor-plan-layouts/" + floorPlanId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: 1, name: "Hijacked Layout" }),
  });
  assert.equal(floorPlanUpdate.status, 404);

  const floorPlanCreate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/floor-plan-layouts", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Injected Layout", canvasWidth: 500, canvasHeight: 300 }),
  });
  assert.equal(floorPlanCreate.status, 404);

  const visitorEmail = "a1-booking-" + ts + "@example.com";
  const visitor = await signupUser(baseUrl, visitorEmail, "A1 Booking Visitor", "visitor");
  visitorUserIds.push(visitor.userId);

  const bookingResponse = await fetch(baseUrl + "/api/bookings/tickets", {
    method: "POST",
    headers: { Authorization: "Bearer " + visitor.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      exhibitionId,
      ticketTypeId,
      attendeeName: "A1 Booking Visitor",
      attendeeEmail: visitorEmail,
      quantity: 1,
    }),
  });
  const bookingBody = await bookingResponse.json();
  assert.equal(bookingResponse.status, 201, JSON.stringify(bookingBody));
  const bookingId = bookingBody.booking.id as string;
  const qrCode = bookingBody.booking.qrCode as string;

  const bookingList = await fetch(baseUrl + "/api/bookings/tickets?exhibitionId=" + exhibitionId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(bookingList.status, 200);
  const bookingListBody = await bookingList.json();
  assert.equal(bookingListBody.bookings.some((item: { id: string }) => item.id === bookingId), false);

  const bookingLookup = await fetch(baseUrl + "/api/bookings/tickets/lookup/" + qrCode, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(bookingLookup.status, 404);

  const bookingCheckIn = await fetch(baseUrl + "/api/bookings/tickets/" + bookingId + "/check-in", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(bookingCheckIn.status, 404);

  const unchanged = await prisma.ticketBooking.findUniqueOrThrow({ where: { id: bookingId } });
  assert.equal(unchanged.checkInStatus, false);
  assert.equal(unchanged.exhibitionId, exhibitionId);
});
