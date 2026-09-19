const { PrismaClient } = require("../server/node_modules/@prisma/client");

const prisma = new PrismaClient();

async function main() {
  await prisma.event.upsert({
    where: { id: "e2e-public-event-001" },
    update: {
      organizerId: "seed-organizer-1",
      ownerId: "seed-user-org1-owner",
      title: "E2E Public Conference 2026",
      slug: "e2e-public-conference-2026",
      description: "Browser E2E verification event.",
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2026-12-10T00:00:00.000Z"),
      endDate: new Date("2026-12-11T00:00:00.000Z"),
      timezone: "Asia/Kolkata",
      venue: "E2E Convention Centre",
      city: "Ahmedabad",
      refundPolicy: "E2E test policy",
      terms: "E2E test terms",
      archivedAt: null,
    },
    create: {
      id: "e2e-public-event-001",
      organizerId: "seed-organizer-1",
      ownerId: "seed-user-org1-owner",
      title: "E2E Public Conference 2026",
      slug: "e2e-public-conference-2026",
      description: "Browser E2E verification event.",
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2026-12-10T00:00:00.000Z"),
      endDate: new Date("2026-12-11T00:00:00.000Z"),
      timezone: "Asia/Kolkata",
      venue: "E2E Convention Centre",
      city: "Ahmedabad",
      refundPolicy: "E2E test policy",
      terms: "E2E test terms",
    },
  });

  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: "e2e-public-event-001", moduleType: "REGISTRATION" } },
    update: { enabled: true },
    create: { eventId: "e2e-public-event-001", moduleType: "REGISTRATION", enabled: true },
  });

  await prisma.event.upsert({
    where: { id: "e2e-hidden-event-001" },
    update: {
      organizerId: "seed-organizer-1",
      ownerId: "seed-user-org1-owner",
      title: "E2E Hidden Conference 2026",
      slug: "e2e-hidden-conference-2026",
      description: "Browser E2E hidden-event verification.",
      eventType: "CONFERENCE",
      status: "DRAFT",
      visibility: "private",
      startDate: new Date("2026-12-15T00:00:00.000Z"),
      endDate: new Date("2026-12-16T00:00:00.000Z"),
      timezone: "Asia/Kolkata",
      venue: "E2E Private Venue",
      city: "Ahmedabad",
      archivedAt: null,
    },
    create: {
      id: "e2e-hidden-event-001",
      organizerId: "seed-organizer-1",
      ownerId: "seed-user-org1-owner",
      title: "E2E Hidden Conference 2026",
      slug: "e2e-hidden-conference-2026",
      description: "Browser E2E hidden-event verification.",
      eventType: "CONFERENCE",
      status: "DRAFT",
      visibility: "private",
      startDate: new Date("2026-12-15T00:00:00.000Z"),
      endDate: new Date("2026-12-16T00:00:00.000Z"),
      timezone: "Asia/Kolkata",
      venue: "E2E Private Venue",
      city: "Ahmedabad",
    },
  });

  console.log("Seeded public and hidden universal events");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
