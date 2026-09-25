import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { prisma } from "../lib/prisma";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

router.get("/:id", async (req, res) => {
  const eventId = z.string().uuid().safeParse(req.params.id);
  if (!eventId.success) return res.status(400).json({ error: "Invalid event id" });

  const organizerIds = await organizerIdsWithPermission(req.user!, "event:view");
  const event = organizerIds.length
    ? await prisma.event.findFirst({
        where: { id: eventId.data, organizerId: { in: organizerIds }, archivedAt: null },
        select: { id: true, organizerId: true, title: true, status: true, startDate: true, endDate: true, timezone: true, moduleEnablements: { where: { moduleType: "ANALYTICS", enabled: true }, select: { id: true } } },
      })
    : null;
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.moduleEnablements.length === 0) return res.status(409).json({ error: "Analytics module is not enabled for this event" });

  const [registrationCounts, ticketCounts, checkInCount, ticketTypes] = await Promise.all([
    prisma.eventRegistration.groupBy({
      by: ["status"],
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.eventTicket.groupBy({
      by: ["status"],
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.eventTicketCheckIn.count({ where: { eventId: event.id } }),
    prisma.eventTicketType.findMany({
      where: { eventId: event.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, capacity: true, price: true, status: true },
    }),
  ]);

  const registrations = { total: 0, confirmed: 0, pending: 0, cancelled: 0 };
  for (const row of registrationCounts) {
    const count = row._count._all;
    registrations.total += count;
    if (row.status === "CONFIRMED") registrations.confirmed += count;
    if (row.status === "PENDING") registrations.pending += count;
    if (row.status === "CANCELLED") registrations.cancelled += count;
  }

  const tickets = { total: 0, active: 0, used: 0, cancelled: 0, refunded: 0 };
  for (const row of ticketCounts) {
    const count = row._count._all;
    tickets.total += count;
    if (row.status === "ACTIVE") tickets.active += count;
    if (row.status === "USED") tickets.used += count;
    if (row.status === "CANCELLED") tickets.cancelled += count;
    if (row.status === "REFUNDED") tickets.refunded += count;
  }

  const paidOrders = await prisma.eventTicketOrder.count({ where: { eventId: event.id, status: "PAID" } });
  const refundedOrders = await prisma.eventTicketOrder.count({ where: { eventId: event.id, status: "REFUNDED" } });
  const paidRevenue = await prisma.eventTicketOrder.aggregate({
    where: { eventId: event.id, status: "PAID" },
    _sum: { totalAmount: true },
  });
  const refundedRevenue = await prisma.eventTicketOrder.aggregate({
    where: { eventId: event.id, status: "REFUNDED" },
    _sum: { totalAmount: true },
  });

  return res.json({
    event,
    registrations,
    tickets: {
      ...tickets,
      checkInRate: tickets.total ? Math.round((tickets.used / tickets.total) * 10000) / 100 : 0,
    },
    checkIns: { total: checkInCount },
    orders: {
      paid: paidOrders,
      refunded: refundedOrders,
      grossPaid: paidRevenue._sum.totalAmount ?? 0,
      refundedAmount: refundedRevenue._sum.totalAmount ?? 0,
      netTicketRevenue: Number(paidRevenue._sum.totalAmount ?? 0) - Number(refundedRevenue._sum.totalAmount ?? 0),
    },
    ticketTypes: ticketTypes.map((type) => ({
      id: type.id,
      name: type.name,
      capacity: type.capacity,
      price: Number(type.price),
      status: type.status,
    })),
  });
});


router.get("/:id/participants", async (req, res) => {
  const eventId = z.string().uuid().safeParse(req.params.id);
  if (!eventId.success) return res.status(400).json({ error: "Invalid event id" });

  const organizerIds = await organizerIdsWithPermission(req.user!, "event:view");
  const event = organizerIds.length
    ? await prisma.event.findFirst({
        where: { id: eventId.data, organizerId: { in: organizerIds } },
        select: {
          id: true,
          title: true,
          status: true,
          moduleEnablements: {
            where: { moduleType: { in: ["ANALYTICS", "PARTICIPANTS"] }, enabled: true },
            select: { moduleType: true },
          },
        },
      })
    : null;

  if (!event) return res.status(404).json({ error: "Event not found" });

  const enabledModules = new Set(event.moduleEnablements.map((module) => module.moduleType));
  if (!enabledModules.has("ANALYTICS")) {
    return res.status(409).json({ error: "Analytics module is not enabled for this event" });
  }
  if (!enabledModules.has("PARTICIPANTS")) {
    return res.status(409).json({ error: "Participants module is not enabled for this event" });
  }

  const participants = await prisma.eventParticipant.findMany({
    where: { eventId: event.id },
    select: {
      id: true,
      participantType: true,
      status: true,
      isPublic: true,
      name: true,
      title: true,
      organization: true,
      bio: true,
      email: true,
      website: true,
      photoUrl: true,
      archivedAt: true,
    },
  });

  const byType = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let publicCount = 0;
  let profileCompleteCount = 0;

  for (const participant of participants) {
    byType.set(participant.participantType, (byType.get(participant.participantType) ?? 0) + 1);
    byStatus.set(participant.status, (byStatus.get(participant.status) ?? 0) + 1);
    if (participant.isPublic) publicCount++;

    const fields = [
      participant.name,
      participant.title,
      participant.organization,
      participant.bio,
      participant.email,
      participant.photoUrl,
    ];
    const completedFields = fields.filter((value) => Boolean(value?.trim())).length;
    if (completedFields === fields.length) profileCompleteCount++;
  }

  const participantIds = participants.map((participant) => participant.id);
  const [mediaCount, documentCount, contactCount, sessionLinkCount, sponsorAssignmentCount, vendorServiceLinkCount, activityCount] = await Promise.all([
    prisma.eventParticipantMedia.count({ where: { participantId: { in: participantIds }, active: true, archivedAt: null } }),
    prisma.eventParticipantDocument.count({ where: { participantId: { in: participantIds }, archivedAt: null } }),
    prisma.eventParticipantContact.count({ where: { participantId: { in: participantIds }, archivedAt: null } }),
    prisma.eventSessionSpeaker.count({ where: { participantId: { in: participantIds } } }),
    prisma.eventSponsorProfile.count({ where: { participantId: { in: participantIds }, packageId: { not: null } } }),
    prisma.eventVendorProfileService.count({ where: { profile: { participantId: { in: participantIds } } } }),
    participantIds.length
      ? prisma.auditLog.count({
          where: {
            OR: [
              { entityType: "EventParticipant", entityId: { in: participantIds } },
            ],
          },
        })
      : Promise.resolve(0),
  ]);

  const activeCount = byStatus.get("ACTIVE") ?? 0;
  const inactiveCount = byStatus.get("INACTIVE") ?? 0;
  const archivedCount = byStatus.get("ARCHIVED") ?? 0;

  return res.json({
    event: { id: event.id, title: event.title, status: event.status },
    participants: {
      total: participants.length,
      active: activeCount,
      inactive: inactiveCount,
      archived: archivedCount,
      public: publicCount,
      private: participants.length - publicCount,
      byType: Object.fromEntries([...byType.entries()].sort(([a], [b]) => a.localeCompare(b))),
      byStatus: Object.fromEntries([...byStatus.entries()].sort(([a], [b]) => a.localeCompare(b))),
    },
    profileCompleteness: {
      complete: profileCompleteCount,
      incomplete: participants.length - profileCompleteCount,
      rate: participants.length ? Math.round((profileCompleteCount / participants.length) * 10000) / 100 : 0,
    },
    engagement: {
      media: mediaCount,
      documents: documentCount,
      contacts: contactCount,
      scheduledSpeakerAssignments: sessionLinkCount,
      sponsorPackageAssignments: sponsorAssignmentCount,
      vendorServiceAssignments: vendorServiceLinkCount,
      activityEvents: activityCount,
    },
    generatedAt: new Date().toISOString(),
  });
});

export default router;
