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
        where: { id: eventId.data, organizerId: { in: organizerIds } },
        select: { id: true, organizerId: true, title: true, status: true, startDate: true, endDate: true, timezone: true },
      })
    : null;
  if (!event) return res.status(404).json({ error: "Event not found" });

  const [registrationCounts, ticketCounts, orderAgg, checkInCount, ticketTypes] = await Promise.all([
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
    prisma.eventTicketOrder.aggregate({
      where: { eventId: event.id, status: { in: ["PAID", "REFUNDED"] } },
      _sum: { totalAmount: true },
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

export default router;
