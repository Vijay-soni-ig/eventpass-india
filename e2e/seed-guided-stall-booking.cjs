const { PrismaClient } = require("../server/node_modules/@prisma/client");

const prisma = new PrismaClient();

const EVENT_ID = "e2e-guided-stall-booking-event-001";
const EXHIBITION_ID = "e2e-guided-stall-booking-exhibition-001";

async function main() {
  const eventData = {
    organizerId: "seed-organizer-1",
    ownerId: "seed-user-org1-owner",
    title: "Bengaluru Tech & Startup Expo 2026",
    slug: "e2e-guided-stall-booking-2026",
    description: "Dedicated fixture for the guided exhibitor stall-booking journey.",
    eventType: "EXHIBITION",
    status: "PUBLISHED",
    visibility: "public",
    startDate: new Date("2026-12-22T00:00:00.000Z"),
    endDate: new Date("2026-12-23T00:00:00.000Z"),
    timezone: "Asia/Kolkata",
    venue: "Bengaluru Exhibition Centre",
    city: "Bengaluru",
    refundPolicy: "Full refund up to 7 days before the event; no refunds within 7 days.",
    terms: "Standard exhibitor and visitor terms apply.",
    archivedAt: null,
  };

  await prisma.event.upsert({
    where: { id: EVENT_ID },
    update: eventData,
    create: { id: EVENT_ID, ...eventData },
  });

  const exhibitionData = {
    ownerId: "seed-user-org1-owner",
    organizerId: "seed-organizer-1",
    name: eventData.title,
    description: eventData.description,
    venue: eventData.venue,
    city: eventData.city,
    startDate: eventData.startDate,
    endDate: eventData.endDate,
    status: "live",
    visibility: "public",
    refundPolicy: eventData.refundPolicy,
    terms: eventData.terms,
    eventId: EVENT_ID,
  };

  await prisma.exhibition.upsert({
    where: { id: EXHIBITION_ID },
    update: exhibitionData,
    create: { id: EXHIBITION_ID, ...exhibitionData },
  });

  console.log("Seeded dedicated guided stall-booking event and exhibition");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
