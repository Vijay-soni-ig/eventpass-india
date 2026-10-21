import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { getExhibitionAnalytics } from "../src/lib/analyticsService";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
  }
});

test("exhibition analytics applies the selected date range to ticket sales and revenue", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "exhibition-analytics-date-range", ts);
  organizerIds.push(owner.organizerId);

  const ticketType = await prisma.ticketType.create({
    data: {
      exhibitionId: owner.firstExhibitionId,
      name: `Date range ticket ${ts}`,
      price: 200,
      quantity: 20,
    },
  });

  const bookings = [
    {
      attendeeName: "Before range",
      attendeeEmail: `before-${ts}@example.com`,
      quantity: 3,
      unitPrice: 100,
      amountPaid: 300,
      paymentStatus: "paid" as const,
      createdAt: new Date("2026-10-09T23:59:59.999Z"),
    },
    {
      attendeeName: "Inside range",
      attendeeEmail: `inside-${ts}@example.com`,
      quantity: 2,
      unitPrice: 100,
      amountPaid: 200,
      paymentStatus: "paid" as const,
      createdAt: new Date("2026-10-10T23:59:59.999Z"),
    },
    {
      attendeeName: "After range",
      attendeeEmail: `after-${ts}@example.com`,
      quantity: 4,
      unitPrice: 100,
      amountPaid: 400,
      paymentStatus: "paid" as const,
      createdAt: new Date("2026-10-11T00:00:00.000Z"),
    },
  ];

  await prisma.ticketBooking.createMany({
    data: bookings.map((booking) => ({
      ...booking,
      exhibitionId: owner.firstExhibitionId,
      ticketTypeId: ticketType.id,
    })),
  });

  const analytics = await getExhibitionAnalytics(owner.firstExhibitionId, {
    from: new Date("2026-10-10T00:00:00.000Z"),
    to: new Date("2026-10-10T23:59:59.999Z"),
    includeRevenue: true,
    includeLeads: false,
  });

  assert.deepEqual(analytics.ticketSales, [{
    ticketTypeId: ticketType.id,
    name: ticketType.name,
    capacity: ticketType.quantity,
    sold: 2,
    revenue: 200,
  }]);
  assert.deepEqual(analytics.revenue, { ticket: 200, stall: 0, total: 200 });
});
