import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { getExhibitionAnalytics } from "../src/lib/analyticsService";
import { startTestServer } from "./helpers/testServer";
import { applyAsExhibitor, bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const dayMs = 24 * 60 * 60 * 1000;
const analyticsDateA = new Date(ts - 3 * dayMs);
analyticsDateA.setUTCHours(10, 0, 0, 0);
const analyticsDateB = new Date(ts - 2 * dayMs);
analyticsDateB.setUTCHours(12, 0, 0, 0);
const checkInDateA = new Date(analyticsDateA);
checkInDateA.setUTCHours(8, 30, 0, 0);
const checkInDateB = new Date(analyticsDateB);
checkInDateB.setUTCHours(17, 15, 0, 0);

function groupCountsByDate(dates: Date[]) {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = date.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

function groupCountsByHour(hours: number[]) {
  const counts = new Map<number, number>();
  for (const hour of hours) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour, count }));
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

test("Exhibition analytics reconciles visitors, check-ins, tickets, stalls, exhibitors, leads, and revenue to source rows", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exhibition-analytics-reconciliation", ts);
  organizerIds.push(organizer.organizerId);
  const exhibitionId = organizer.firstExhibitionId;

  const ticketType = await prisma.ticketType.create({
    data: {
      exhibitionId,
      name: `Analytics reconciliation pass ${ts}`,
      price: 200,
      quantity: 20,
    },
  });

  const bookings = await prisma.ticketBooking.createMany({
    data: [
      {
        exhibitionId,
        ticketTypeId: ticketType.id,
        attendeeName: "Reconciliation Visitor A",
        attendeeEmail: `analytics-reconcile-a-${ts}@example.com`,
        quantity: 2,
        unitPrice: 200,
        amountPaid: 400,
        paymentStatus: "paid",
        createdAt: analyticsDateA,
      },
      {
        exhibitionId,
        ticketTypeId: ticketType.id,
        attendeeName: "Reconciliation Visitor B",
        attendeeEmail: `analytics-reconcile-b-${ts}@example.com`,
        quantity: 1,
        unitPrice: 200,
        amountPaid: 200,
        paymentStatus: "paid",
        createdAt: analyticsDateB,
      },
    ],
  });
  assert.equal(bookings.count, 2);

  const paidBookings = await prisma.ticketBooking.findMany({
    where: { exhibitionId, paymentStatus: "paid" },
    select: { id: true, quantity: true, amountPaid: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(paidBookings.length, 2);
  await prisma.checkIn.create({
    data: { ticketBookingId: paidBookings[0].id, method: "qr", scannedAt: checkInDateA },
  });
  await prisma.checkIn.create({
    data: { ticketBookingId: paidBookings[1].id, method: "qr", scannedAt: checkInDateB },
  });

  const exhibitor = await applyAsExhibitor(baseUrl, exhibitionId, "exhibition-analytics-reconciliation-exhibitor", ts);
  await prisma.exhibitionExhibitor.update({
    where: { id: exhibitor.participationId },
    data: { status: "confirmed", confirmedAt: new Date() },
  });
  const participationId = exhibitor.participationId;
  const business = await prisma.exhibitionExhibitor.findUniqueOrThrow({
    where: { id: participationId },
    select: { business: { select: { companyName: true } } },
  });
  const businessName = business.business.companyName ?? "Unnamed business";

  await prisma.stall.createMany({
    data: [
      { exhibitionId, code: `AN-AVAILABLE-${ts}`, status: "available", price: 1000 },
      { exhibitionId, code: `AN-RESERVED-${ts}`, status: "reserved", price: 1500, exhibitionExhibitorId: participationId },
      { exhibitionId, code: `AN-SOLD-${ts}`, status: "sold", price: 2500, exhibitionExhibitorId: participationId },
    ],
  });
  const soldStall = await prisma.stall.findFirstOrThrow({
    where: { exhibitionId, code: `AN-SOLD-${ts}` },
    select: { id: true },
  });
  await prisma.stallBooking.create({
    data: {
      stallId: soldStall.id,
      exhibitionId,
      exhibitionExhibitorId: participationId,
      buyerName: "Reconciliation Stall Buyer",
      buyerEmail: `stall-analytics-reconcile-${ts}@example.com`,
      amountPaid: 2500,
      paymentStatus: "paid",
    },
  });

  const createdLeads = await prisma.lead.createMany({
    data: [
      { exhibitionExhibitorId: participationId, visitorName: "New Lead", visitorEmail: `new-lead-${ts}@example.com`, status: "new" },
      { exhibitionExhibitorId: participationId, visitorName: "Contacted Lead", visitorEmail: `contacted-lead-${ts}@example.com`, status: "contacted" },
      { exhibitionExhibitorId: participationId, visitorName: "Converted Lead", visitorEmail: `converted-lead-${ts}@example.com`, status: "converted" },
      { exhibitionExhibitorId: participationId, visitorName: "Lost Lead", visitorEmail: `lost-lead-${ts}@example.com`, status: "lost" },
    ],
  });
  assert.equal(createdLeads.count, 4);


  const analytics = await getExhibitionAnalytics(exhibitionId, {
    includeRevenue: true,
    includeLeads: true,
  });

  // Visitors-over-time counts paid booking rows, while ticket sales sum booking
  // quantities. Keep these distinct so an analytics regression cannot conflate
  // bookings with attendees.
  assert.equal(sum(analytics.visitorsOverTime.map((row) => row.count)), paidBookings.length);
  const sourceCheckInRecords = await prisma.checkIn.findMany({
    where: { ticketBooking: { exhibitionId, paymentStatus: "paid" } },
    select: { scannedAt: true },
  });
  assert.deepEqual(
    analytics.visitorsOverTime,
    groupCountsByDate(paidBookings.map((booking) => booking.createdAt)),
    "visitor daily buckets must match the source paid-booking rows",
  );
  assert.deepEqual(
    analytics.checkInsOverTime,
    groupCountsByDate(sourceCheckInRecords.map((record) => record.scannedAt)),
    "check-in daily buckets must match source scan timestamps",
  );
  assert.deepEqual(
    analytics.peakEntryPeriods,
    groupCountsByHour(sourceCheckInRecords.map((record) => record.scannedAt.getUTCHours())),
    "peak-entry hour buckets must match source scan timestamps",
  );
  assert.equal(sourceCheckInRecords.length, 2);
  assert.deepEqual(analytics.visitorsOverTime, [
    { date: analyticsDateA.toISOString().slice(0, 10), count: 1 },
    { date: analyticsDateB.toISOString().slice(0, 10), count: 1 },
  ]);
  assert.deepEqual(analytics.checkInsOverTime, [
    { date: checkInDateA.toISOString().slice(0, 10), count: 1 },
    { date: checkInDateB.toISOString().slice(0, 10), count: 1 },
  ]);
  assert.deepEqual(analytics.peakEntryPeriods, [{ hour: 8, count: 1 }, { hour: 17, count: 1 }]);

  const sourceTicketType = await prisma.ticketType.findUniqueOrThrow({
    where: { id: ticketType.id },
    select: {
      id: true,
      name: true,
      quantity: true,
      bookings: { where: { paymentStatus: "paid" }, select: { quantity: true, amountPaid: true } },
    },
  });
  const ticketSale = analytics.ticketSales.find((row) => row.ticketTypeId === ticketType.id);
  assert.ok(ticketSale, "analytics must include the created ticket type");
  assert.deepEqual(ticketSale, {
    ticketTypeId: sourceTicketType.id,
    name: sourceTicketType.name,
    capacity: sourceTicketType.quantity,
    sold: sum(sourceTicketType.bookings.map((booking) => booking.quantity)),
    revenue: sum(sourceTicketType.bookings.map((booking) => Number(booking.amountPaid))),
  });
  assert.equal(ticketSale.sold, 3);
  assert.equal(ticketSale.revenue, 600);

  const stallGroups = await prisma.stall.groupBy({
    by: ["status"],
    where: { exhibitionId },
    _count: { _all: true },
  });
  const expectedStallOccupancy = {
    total: stallGroups.reduce((total, row) => total + row._count._all, 0),
    sold: stallGroups.find((row) => row.status === "sold")?._count._all ?? 0,
    reserved: stallGroups.find((row) => row.status === "reserved")?._count._all ?? 0,
    available: stallGroups.find((row) => row.status === "available")?._count._all ?? 0,
  };
  assert.deepEqual(analytics.stallOccupancy, expectedStallOccupancy);
  assert.deepEqual(analytics.stallOccupancy, { total: 3, sold: 1, reserved: 1, available: 1 });

  const sourceConfirmedExhibitors = await prisma.exhibitionExhibitor.count({
    where: { exhibitionId, status: "confirmed" },
  });
  assert.equal(analytics.exhibitorsCount, sourceConfirmedExhibitors);
  assert.equal(analytics.exhibitorsCount, 1);

  const leadGroups = await prisma.lead.groupBy({
    by: ["status"],
    where: { exhibitionExhibitor: { exhibitionId } },
    _count: { _all: true },
  });
  const expectedLeadByStatus: Record<string, number> = {};
  for (const row of leadGroups) expectedLeadByStatus[row.status] = row._count._all;
  const sourceLeadCount = await prisma.lead.count({ where: { exhibitionExhibitor: { exhibitionId } } });
  assert.deepEqual(analytics.leads, {
    total: sourceLeadCount,
    byStatus: expectedLeadByStatus,
  });
  assert.deepEqual(analytics.leads, {
    total: 4,
    byStatus: { new: 1, contacted: 1, converted: 1, lost: 1 },
  });

  const leadGroupsByExhibitor = await prisma.lead.groupBy({
    by: ["exhibitionExhibitorId"],
    where: { exhibitionExhibitor: { exhibitionId } },
    _count: { _all: true },
  });
  const expectedLeadsPerExhibitor = leadGroupsByExhibitor.map((row) => ({
    exhibitionExhibitorId: row.exhibitionExhibitorId,
    name: businessName,
    leadCount: row._count._all,
  }));
  assert.deepEqual(analytics.leadsPerExhibitor, expectedLeadsPerExhibitor);
  assert.deepEqual(analytics.leadsPerExhibitor, [{ exhibitionExhibitorId: participationId, name: businessName, leadCount: 4 }]);
  assert.deepEqual(analytics.topExhibitors, expectedLeadsPerExhibitor.slice(0, 5));

  const [ticketRevenue, stallRevenue] = await Promise.all([
    prisma.ticketBooking.aggregate({
      where: { exhibitionId, paymentStatus: "paid" },
      _sum: { amountPaid: true },
    }),
    prisma.stallBooking.aggregate({
      where: { exhibitionId, paymentStatus: "paid" },
      _sum: { amountPaid: true },
    }),
  ]);
  const expectedTicketRevenue = Number(ticketRevenue._sum.amountPaid ?? 0);
  const expectedStallRevenue = Number(stallRevenue._sum.amountPaid ?? 0);
  assert.deepEqual(analytics.revenue, {
    ticket: expectedTicketRevenue,
    stall: expectedStallRevenue,
    total: expectedTicketRevenue + expectedStallRevenue,
  });
  assert.deepEqual(analytics.revenue, { ticket: 600, stall: 2500, total: 3100 });
});
