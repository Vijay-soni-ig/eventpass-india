import assert from "node:assert/strict";
import { test, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { backfillEvents, verifyEventBackfillInvariants, slugifyCategoryName } from "../src/lib/eventBackfill";

// ETX-EVENT-001B — automated verification of the Exhibition <-> Event
// backfill invariant. Exercises the real backfillEvents()/
// verifyEventBackfillInvariants() functions against real rows (no mocks),
// consistent with the rest of this suite. Does not depend on a running HTTP
// server: Exhibition/Organizer/User rows are created directly via Prisma,
// since the backfill itself is a data-layer concern, not a route.

const ts = Date.now();
const createdUserIds: string[] = [];
const createdOrganizerIds: string[] = [];
const createdExhibitionIds: string[] = [];
const createdEventIds: string[] = [];
const createdCategoryIds: string[] = [];

after(async () => {
  // Unlink/delete in dependency order. Deleting an Event sets the owning
  // Exhibition's eventId to null (onDelete: SetNull) before the Exhibition
  // row itself is deleted, so this never trips the FK.
  if (createdEventIds.length) await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
  if (createdCategoryIds.length) await prisma.eventCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdExhibitionIds.length) await prisma.exhibition.deleteMany({ where: { id: { in: createdExhibitionIds } } });
  if (createdOrganizerIds.length) await prisma.organizer.deleteMany({ where: { id: { in: createdOrganizerIds } } });
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

async function createOwnerAndOrganizer(label: string) {
  const user = await prisma.user.create({
    data: { email: `eventbackfill-${label}-${ts}@example.com`, passwordHash: "not-used-in-this-test", userType: "exhibitor" },
  });
  createdUserIds.push(user.id);
  const organizer = await prisma.organizer.create({
    data: { name: `EventBackfill QA Org ${label} ${ts}`, bootstrappedByUserId: user.id },
  });
  createdOrganizerIds.push(organizer.id);
  return { user, organizer };
}

test("backfillEvents links an Exhibition to exactly one correctly-mapped Event, is idempotent, and never touches unrelated tables", async () => {
  const { user, organizer } = await createOwnerAndOrganizer("main");
  const categoryName = `QA Test Category ${ts}`;

  const exhibition = await prisma.exhibition.create({
    data: {
      ownerId: user.id,
      organizerId: organizer.id,
      name: `QA Backfill Exhibition ${ts}`,
      category: categoryName,
      description: "Automated backfill invariant check fixture",
      venue: "QA Venue",
      city: "QA City",
      latitude: 12.34,
      longitude: 56.78,
      startDate: new Date("2027-01-10"),
      endDate: new Date("2027-01-12"),
      coverImageUrl: "https://example.com/cover.png",
      refundPolicy: "No refunds",
      terms: "QA terms",
      status: "live",
      visibility: "public",
    },
  });
  createdExhibitionIds.push(exhibition.id);

  // Baseline for every table the backfill must never write to.
  const countAll = () =>
    Promise.all([
      prisma.ticketBooking.count(),
      prisma.stallBooking.count(),
      prisma.payment.count(),
      prisma.refund.count(),
      prisma.stall.count(),
      prisma.floorPlan.count(),
      prisma.checkIn.count(),
      prisma.lead.count(),
    ]);
  const before = await countAll();

  const result1 = await backfillEvents();
  assert.ok(result1.linked >= 1, "backfill must link at least the exhibition just created");

  const linkedExhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibition.id } });
  assert.ok(linkedExhibition.eventId, "Exhibition.eventId must be set after backfill");
  const eventId = linkedExhibition.eventId!;
  createdEventIds.push(eventId);

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { category: true } });
  assert.equal(event.title, exhibition.name);
  assert.equal(event.description, exhibition.description);
  assert.equal(event.organizerId, exhibition.organizerId, "Event must point at the same organizer as the Exhibition");
  assert.equal(event.ownerId, exhibition.ownerId, "Event must point at the same owner as the Exhibition");
  assert.equal(event.eventType, "EXHIBITION");
  assert.equal(event.status, "PUBLISHED", "exhibition status 'live' must map to Event status 'PUBLISHED'");
  assert.equal(event.visibility, "public");
  assert.equal(event.venue, "QA Venue");
  assert.equal(event.city, "QA City");
  assert.equal(event.latitude, 12.34);
  assert.equal(event.longitude, 56.78);
  assert.equal(event.startDate?.toISOString().slice(0, 10), "2027-01-10");
  assert.equal(event.endDate?.toISOString().slice(0, 10), "2027-01-12");
  assert.equal(event.coverImageUrl, exhibition.coverImageUrl);
  assert.equal(event.refundPolicy, exhibition.refundPolicy);
  assert.equal(event.terms, exhibition.terms);
  assert.ok(event.category, "a category must be created/linked since Exhibition.category was set");
  assert.equal(event.category!.name, categoryName, "the category name must be preserved verbatim, not invented");
  assert.equal(event.category!.slug, slugifyCategoryName(categoryName));
  createdCategoryIds.push(event.categoryId!);

  // Idempotency: rerunning must not create a duplicate Event or move the link.
  const eventCountAfterFirst = await prisma.event.count();
  const result2 = await backfillEvents();
  assert.equal(result2.linked, 0, "a second run must link nothing new once every exhibition already has an Event");
  const eventCountAfterSecond = await prisma.event.count();
  assert.equal(eventCountAfterSecond, eventCountAfterFirst, "rerunning the backfill must never create duplicate Event rows");
  const reRead = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibition.id } });
  assert.equal(reRead.eventId, eventId, "rerunning must not reassign an already-linked exhibition to a different Event");
  assert.equal(reRead.id, exhibition.id, "the Exhibition's own id must never change");

  const mismatches = (await verifyEventBackfillInvariants()).filter((m) => m.exhibitionId === exhibition.id);
  assert.deepEqual(mismatches, [], "no field mismatch should exist between this Exhibition and its linked Event");

  const after_ = await countAll();
  assert.deepEqual(
    after_,
    before,
    "backfill must never change TicketBooking/StallBooking/Payment/Refund/Stall/FloorPlan/CheckIn/Lead row counts",
  );
});

test("backfillEvents reuses one EventCategory for a shared category string across exhibitions, and never invents a category for a null one", async () => {
  const { user, organizer } = await createOwnerAndOrganizer("dup");
  const sharedCategory = `QA Shared Category ${ts}`;

  const [exA, exB, exNoCategory] = await Promise.all([
    prisma.exhibition.create({ data: { ownerId: user.id, organizerId: organizer.id, name: `QA Dup A ${ts}`, category: sharedCategory, status: "draft", visibility: "private" } }),
    prisma.exhibition.create({ data: { ownerId: user.id, organizerId: organizer.id, name: `QA Dup B ${ts}`, category: sharedCategory, status: "paused", visibility: "private" } }),
    prisma.exhibition.create({ data: { ownerId: user.id, organizerId: organizer.id, name: `QA No Category ${ts}`, category: null, status: "completed", visibility: "public" } }),
  ]);
  createdExhibitionIds.push(exA.id, exB.id, exNoCategory.id);

  await backfillEvents();

  const [linkedA, linkedB, linkedNoCategory] = await Promise.all([
    prisma.exhibition.findUniqueOrThrow({ where: { id: exA.id } }),
    prisma.exhibition.findUniqueOrThrow({ where: { id: exB.id } }),
    prisma.exhibition.findUniqueOrThrow({ where: { id: exNoCategory.id } }),
  ]);
  createdEventIds.push(linkedA.eventId!, linkedB.eventId!, linkedNoCategory.eventId!);

  const [eventA, eventB, eventNoCategory] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: linkedA.eventId! } }),
    prisma.event.findUniqueOrThrow({ where: { id: linkedB.eventId! } }),
    prisma.event.findUniqueOrThrow({ where: { id: linkedNoCategory.eventId! } }),
  ]);

  assert.notEqual(eventA.id, eventB.id, "two exhibitions must get two distinct Event rows");
  assert.ok(eventA.categoryId, "shared-category exhibition A must have a category");
  assert.equal(eventA.categoryId, eventB.categoryId, "the same category string must resolve to the same EventCategory row, not a duplicate");
  assert.equal(eventA.status, "DRAFT");
  assert.equal(eventB.status, "PAUSED");
  assert.equal(eventNoCategory.categoryId, null, "an Exhibition with no category must link to an Event with categoryId = null");
  assert.equal(eventNoCategory.status, "COMPLETED");

  const categoryCount = await prisma.eventCategory.count({ where: { name: sharedCategory } });
  assert.equal(categoryCount, 1, "exactly one EventCategory row must exist for this category string, however many exhibitions share it");
  createdCategoryIds.push(eventA.categoryId!);
});
