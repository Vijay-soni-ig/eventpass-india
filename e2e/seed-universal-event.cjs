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


async function seedUniversalLeadCapture() {
  const crypto = require("crypto");
  const qrSecret = process.env.TICKET_QR_SECRET || process.env.JWT_SECRET || "ci-test-secret";
  const exhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: "seed-exhibition-1" } });
  await prisma.event.upsert({
    where: { id: "e2e-lead-event-001" },
    update: { organizerId: exhibition.organizerId, ownerId: exhibition.ownerId, title: "E2E Lead Capture Expo 2026", slug: "e2e-lead-capture-expo-2026", description: "Dedicated universal lead capture E2E event.", eventType: "EXHIBITION", status: "PUBLISHED", visibility: "public", startDate: new Date("2026-12-20T00:00:00.000Z"), endDate: new Date("2026-12-21T00:00:00.000Z"), timezone: "Asia/Kolkata", venue: exhibition.venue, city: exhibition.city, archivedAt: null },
    create: { id: "e2e-lead-event-001", organizerId: exhibition.organizerId, ownerId: exhibition.ownerId, title: "E2E Lead Capture Expo 2026", slug: "e2e-lead-capture-expo-2026", description: "Dedicated universal lead capture E2E event.", eventType: "EXHIBITION", status: "PUBLISHED", visibility: "public", startDate: new Date("2026-12-20T00:00:00.000Z"), endDate: new Date("2026-12-21T00:00:00.000Z"), timezone: "Asia/Kolkata", venue: exhibition.venue, city: exhibition.city },
  });
  await prisma.exhibition.update({ where: { id: exhibition.id }, data: { eventId: "e2e-lead-event-001" } });
  const biz1User = await prisma.user.findUniqueOrThrow({ where: { email: "biz1.staff@eventpass.test" } });
  const biz1Membership = await prisma.exhibitorMembership.findFirst({
    where: { userId: biz1User.id, status: "active" },
    select: { exhibitorBusinessId: true },
  });
  if (!biz1Membership) throw new Error("biz1 staff user has no active exhibitor membership");
  await prisma.exhibitionExhibitor.upsert({
    where: { exhibitionId_exhibitorBusinessId: { exhibitionId: exhibition.id, exhibitorBusinessId: biz1Membership.exhibitorBusinessId } },
    update: { status: "confirmed", confirmedAt: new Date() },
    create: { exhibitionId: exhibition.id, exhibitorBusinessId: biz1Membership.exhibitorBusinessId, status: "confirmed", confirmedAt: new Date() },
  });
  for (const moduleType of ["TICKETING", "LEADS", "PARTICIPANTS", "SPEAKERS", "SPONSORS", "VENDORS"]) {
    await prisma.eventModuleEnablement.upsert({ where: { eventId_moduleType: { eventId: "e2e-lead-event-001", moduleType } }, update: { enabled: true }, create: { eventId: "e2e-lead-event-001", moduleType, enabled: true } });
  }
  const ticketType = await prisma.eventTicketType.upsert({
    where: { id: "e2e-lead-ticket-type-001" },
    update: { eventId: "e2e-lead-event-001", name: "E2E Visitor Pass", price: 0, currency: "INR", capacity: 100, maxPerOrder: 10, status: "ACTIVE" },
    create: { id: "e2e-lead-ticket-type-001", eventId: "e2e-lead-event-001", name: "E2E Visitor Pass", price: 0, currency: "INR", capacity: 100, maxPerOrder: 10, status: "ACTIVE" },
  });
  const visitor = await prisma.user.findUniqueOrThrow({ where: { id: "seed-visitor-01" } });
  const payment = await prisma.payment.upsert({ where: { id: "e2e-lead-payment-001" }, update: { amount: 0, currency: "INR", provider: "free", status: "paid", baseAmount: 0, organizerAmount: 0, pricingVersionId: "pv-legacy-unversioned", providerPaymentId: "e2e-lead-payment-verified" }, create: { id: "e2e-lead-payment-001", amount: 0, currency: "INR", provider: "free", status: "paid", baseAmount: 0, organizerAmount: 0, pricingVersionId: "pv-legacy-unversioned", providerPaymentId: "e2e-lead-payment-verified" } });
  const reservation = await prisma.eventTicketReservation.upsert({ where: { id: "e2e-lead-reservation-001" }, update: { eventTicketTypeId: ticketType.id, eventId: "e2e-lead-event-001", userId: visitor.id, attendeeName: visitor.fullName || visitor.email, attendeeEmail: visitor.email, attendeePhone: visitor.phone, quantity: 1, unitPrice: 0, currency: "INR", status: "CONVERTED", expiresAt: new Date("2026-12-19T00:00:00.000Z") }, create: { id: "e2e-lead-reservation-001", eventTicketTypeId: ticketType.id, eventId: "e2e-lead-event-001", userId: visitor.id, attendeeName: visitor.fullName || visitor.email, attendeeEmail: visitor.email, attendeePhone: visitor.phone, quantity: 1, unitPrice: 0, currency: "INR", status: "CONVERTED", expiresAt: new Date("2026-12-19T00:00:00.000Z") } });
  const order = await prisma.eventTicketOrder.upsert({ where: { id: "e2e-lead-order-001" }, update: { eventId: "e2e-lead-event-001", reservationId: reservation.id, userId: visitor.id, paymentId: payment.id, quantity: 1, unitPrice: 0, subtotal: 0, totalAmount: 0, currency: "INR", status: "PAID", idempotencyKey: "e2e-lead-order-001" }, create: { id: "e2e-lead-order-001", eventId: "e2e-lead-event-001", reservationId: reservation.id, userId: visitor.id, paymentId: payment.id, quantity: 1, unitPrice: 0, subtotal: 0, totalAmount: 0, currency: "INR", status: "PAID", idempotencyKey: "e2e-lead-order-001" } });
  const makeQr = (id, code) => { const raw = crypto.createHmac("sha256", qrSecret).update(id + "." + code).digest("base64url"); return { code, hash: crypto.createHash("sha256").update(raw).digest("hex"), payload: `ETX1.${code}.${raw}` }; };
  const used = makeQr("e2e-lead-ticket-used-001", "ETX-E2E-USED-001");
  const active = makeQr("e2e-lead-ticket-active-001", "ETX-E2E-ACTIVE-001");
  for (const t of [{ id: "e2e-lead-ticket-used-001", ...used, status: "USED", checkedInAt: new Date("2026-12-20T09:00:00.000Z") }, { id: "e2e-lead-ticket-active-001", ...active, status: "ACTIVE", checkedInAt: null }]) {
    await prisma.eventTicket.upsert({ where: { id: t.id }, update: { eventId: "e2e-lead-event-001", eventTicketOrderId: order.id, eventTicketTypeId: ticketType.id, userId: visitor.id, attendeeName: visitor.fullName || visitor.email, attendeeEmail: visitor.email, attendeePhone: visitor.phone, ticketCode: t.code, qrTokenHash: t.hash, status: t.status, checkedInAt: t.checkedInAt }, create: { id: t.id, eventId: "e2e-lead-event-001", eventTicketOrderId: order.id, eventTicketTypeId: ticketType.id, userId: visitor.id, attendeeName: visitor.fullName || visitor.email, attendeeEmail: visitor.email, attendeePhone: visitor.phone, ticketCode: t.code, qrTokenHash: t.hash, status: t.status, checkedInAt: t.checkedInAt } });
  }
  await prisma.eventParticipant.upsert({
    where: { id: "e2e-participant-speaker-001" },
    update: { eventId: "e2e-lead-event-001", participantType: "SPEAKER", name: "E2E Speaker", title: "Conference Speaker", organization: "ExhibitTix Labs", isPublic: true, status: "ACTIVE", sortOrder: 1 },
    create: { id: "e2e-participant-speaker-001", eventId: "e2e-lead-event-001", participantType: "SPEAKER", name: "E2E Speaker", title: "Conference Speaker", organization: "ExhibitTix Labs", isPublic: true, status: "ACTIVE", sortOrder: 1 },
  });
  await prisma.eventParticipant.upsert({
    where: { id: "e2e-participant-sponsor-001" },
    update: { eventId: "e2e-lead-event-001", participantType: "SPONSOR", name: "E2E Sponsor", title: "Gold Sponsor", organization: "Sponsor Corp", isPublic: true, status: "ACTIVE", sortOrder: 2 },
    create: { id: "e2e-participant-sponsor-001", eventId: "e2e-lead-event-001", participantType: "SPONSOR", name: "E2E Sponsor", title: "Gold Sponsor", organization: "Sponsor Corp", isPublic: true, status: "ACTIVE", sortOrder: 2 },
  });
  await prisma.eventLead.deleteMany({ where: { eventId: "e2e-lead-event-001" } });
  console.log("Seeded universal lead capture fixtures");
}

main().then(seedUniversalLeadCapture)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
