import { Router } from "express";
import { z } from "zod";
import { getEventTicketByQrPayload } from "../lib/eventTicketIssuance";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
import { requireAuth } from "../middleware/auth";
import { eventTicketCheckInRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth);

const checkInSchema = z.object({
  qrPayload: z.string().trim().min(10).max(4096),
  eventId: z.string().trim().min(1).max(128).optional(),
});

router.get("/summary", async (req, res) => {
  const eventId = z.string().trim().min(1).max(128).safeParse(req.query.eventId);
  if (!eventId.success) return res.status(400).json({ error: "A valid eventId is required" });

  const result = await withLockedEventAccess(eventId.data, req.user!, "scanner:use", async (tx, event) => {
    const currentEvent = await tx.event.findUnique({
      where: { id: event.id },
      select: {
        id: true,
        title: true,
        status: true,
        archivedAt: true,
        moduleEnablements: {
          where: { moduleType: "CHECK_IN", enabled: true },
          select: { id: true },
        },
      },
    });
    if (!currentEvent) return { kind: "not_found" as const };
    if (currentEvent.moduleEnablements.length === 0) return { kind: "module_disabled" as const };

    const [ticketCounts, recentScans] = await Promise.all([
      tx.eventTicket.groupBy({
        by: ["status"],
        where: { eventId: event.id },
        _count: { _all: true },
      }),
      tx.eventTicketCheckIn.findMany({
        where: { eventId: event.id },
        orderBy: { scannedAt: "desc" },
        take: 20,
        select: {
          id: true,
          scannedAt: true,
          method: true,
          eventTicket: {
            select: {
              ticketCode: true,
              attendeeName: true,
              eventTicketType: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const counts = { total: 0, active: 0, used: 0, cancelled: 0, refunded: 0 };
    for (const row of ticketCounts) {
      const count = row._count._all;
      counts.total += count;
      if (row.status === "ACTIVE") counts.active += count;
      if (row.status === "USED") counts.used += count;
      if (row.status === "CANCELLED") counts.cancelled += count;
      if (row.status === "REFUNDED") counts.refunded += count;
    }

    return {
      kind: "ok" as const,
      event: { id: currentEvent.id, title: currentEvent.title, status: currentEvent.status, archived: Boolean(currentEvent.archivedAt) },
      counts: {
        ...counts,
        checkInRate: counts.total > 0 ? Math.round((counts.used / counts.total) * 10000) / 100 : 0,
      },
      recentScans,
    };
  }, true);

  if (!result || result.kind === "not_found") {
    return res.status(403).json({ error: "You are not authorized to view check-in operations for this event" });
  }
  if (result.kind === "module_disabled") {
    return res.status(409).json({ error: "Check-in module is not enabled for this event" });
  }

  return res.json({ event: result.event, counts: result.counts, recentScans: result.recentScans });
});

router.post("/", eventTicketCheckInRateLimit, async (req, res) => {
  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid QR payload" });
  }

  const ticket = await getEventTicketByQrPayload(parsed.data.qrPayload);
  if (!ticket) return res.status(404).json({ error: "Invalid or unrecognized ticket QR code" });

  if (parsed.data.eventId && String(ticket.event_id) !== parsed.data.eventId) {
    return res.status(409).json({ error: "This ticket belongs to a different event" });
  }

  const result = await withLockedEventAccess(String(ticket.event_id), req.user!, "scanner:use", async (tx, event) => {
    const checkInModule = await tx.eventModuleEnablement.findUnique({
      where: { eventId_moduleType: { eventId: event.id, moduleType: "CHECK_IN" } },
      select: { enabled: true },
    });
    if (!checkInModule?.enabled) return { kind: "module_disabled" as const };
    // Match refund lock ordering: Payment first, then the ticket. This prevents
    // check-in from racing a refund that has already entered PROCESSING.
    const paymentRows = await tx.$queryRawUnsafe<Array<{ payment_id: string }>>(
      `SELECT o."paymentId" AS "payment_id"
         FROM "event_tickets" t
         JOIN "event_ticket_orders" o ON o."id" = t."event_ticket_order_id"
        WHERE t."id" = $1`,
      String(ticket.id),
    );
    const paymentId = paymentRows[0]?.payment_id;
    if (!paymentId) return { kind: "not_found" as const };
    await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "event_tickets" WHERE "id" = ${String(ticket.id)} FOR UPDATE`;

    const rows = await tx.$queryRawUnsafe<Array<{
      id: string;
      event_id: string;
      event_ticket_order_id: string;
      status: string;
      order_status: string;
      payment_status: string;
      event_status: string;
      archived_at: Date | null;
      checked_in_at: Date | null;
    }>>(
      `SELECT t."id", t."event_id", t."event_ticket_order_id", t."status",
              o."status" AS "order_status", p."status" AS "payment_status",
              e."status" AS "event_status", e."archivedAt" AS "archived_at", t."checked_in_at"
         FROM "event_tickets" t
         JOIN "event_ticket_orders" o ON o."id" = t."event_ticket_order_id"
         JOIN "payments" p ON p."id" = o."paymentId"
         JOIN "events" e ON e."id" = t."event_id"
        WHERE t."id" = $1
        FOR UPDATE OF t, o, e`,
      String(ticket.id),
    );
    const current = rows[0];
    if (!current || current.event_id !== event.id) return { kind: "not_found" as const };
    if (current.status !== "ACTIVE") {
      const last = await tx.eventTicketCheckIn.findFirst({
        where: { eventTicketId: current.id },
        orderBy: { scannedAt: "desc" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: current.status === "USED" ? "EVENT_TICKET_DUPLICATE_CHECKIN_REJECTED" : "EVENT_TICKET_CHECKIN_REJECTED",
          entityType: "EventTicket",
          entityId: current.id,
          metadata: { eventId: current.event_id, status: current.status, method: "QR" },
        },
      });
      return { kind: "already_processed" as const, status: current.status, last };
    }
    if (current.order_status !== "PAID" || current.payment_status !== "paid") {
      await tx.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: "EVENT_TICKET_CHECKIN_REJECTED_UNPAID",
          entityType: "EventTicket",
          entityId: current.id,
          metadata: { eventId: current.event_id, orderStatus: current.order_status, method: "QR" },
        },
      });
      return { kind: "payment_invalid" as const };
    }
    const pendingRefund = await tx.refund.findFirst({
      where: { paymentId, status: { in: ["REQUESTED", "PROCESSING"] } },
      select: { id: true },
    });
    if (pendingRefund) {
      await tx.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: "EVENT_TICKET_CHECKIN_REJECTED_REFUND_PENDING",
          entityType: "EventTicket",
          entityId: current.id,
          metadata: { eventId: current.event_id, refundId: pendingRefund.id, method: "QR" },
        },
      });
      return { kind: "refund_pending" as const };
    }
    if (current.event_status !== "PUBLISHED" || current.archived_at) {
      await tx.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: "EVENT_TICKET_CHECKIN_REJECTED_EVENT_UNAVAILABLE",
          entityType: "EventTicket",
          entityId: current.id,
          metadata: { eventId: current.event_id, eventStatus: current.event_status, archived: Boolean(current.archived_at), method: "QR" },
        },
      });
      return { kind: "event_unavailable" as const };
    }

    const now = new Date();
    const updated = await tx.eventTicket.update({
      where: { id: current.id },
      data: { status: "USED", checkedInAt: now },
      select: {
        id: true,
        eventId: true,
        ticketCode: true,
        attendeeName: true,
        attendeeEmail: true,
        status: true,
        checkedInAt: true,
      },
    });
    const checkIn = await tx.eventTicketCheckIn.create({
      data: {
        eventTicketId: current.id,
        eventId: current.event_id,
        scannedByUserId: req.user!.id,
        method: "QR",
        scannedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: req.user!.id,
        action: "EVENT_TICKET_CHECKED_IN",
        entityType: "EventTicket",
        entityId: current.id,
        metadata: {
          eventId: current.event_id,
          ticketCode: updated.ticketCode,
          checkInId: checkIn.id,
          method: "QR",
        },
      },
    });
    return { kind: "checked_in" as const, ticket: updated, checkIn };
  }, true);

  if (!result) return res.status(403).json({ error: "You are not authorized to scan tickets for this event" });
  if (result.kind === "module_disabled") return res.status(409).json({ error: "Check-in module is not enabled for this event" });
  if (result.kind === "not_found") return res.status(404).json({ error: "Ticket not found" });
  if (result.kind === "already_processed") {
    return res.status(409).json({
      error: result.status === "USED" ? "This ticket has already been checked in" : "This ticket is not usable",
      status: result.status,
      lastCheckIn: result.last,
    });
  }
  if (result.kind === "payment_invalid") {
    return res.status(409).json({ error: "This ticket is not backed by a paid order" });
  }
  if (result.kind === "refund_pending") {
    return res.status(409).json({ error: "This ticket has a refund in progress and cannot be checked in" });
  }
  if (result.kind === "event_unavailable") {
    return res.status(409).json({ error: "This event is not currently accepting check-ins" });
  }

  return res.status(200).json({
    success: true,
    ticket: result.ticket,
    checkIn: result.checkIn,
  });
});

export default router;
