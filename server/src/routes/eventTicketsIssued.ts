import { Router } from "express";
import { createHmac } from "crypto";
import QRCode from "qrcode";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { getEventTicketByQrPayload } from "../lib/eventTicketIssuance";

const router = Router();
router.use(requireAuth);

function qrTokenForTicket(id: string, ticketCode: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for QR ticket signing");
  return createHmac("sha256", secret).update(id + "." + ticketCode).digest("base64url");
}

function qrPayloadForTicket(id: string, ticketCode: string) {
  return "ETX1." + ticketCode + "." + qrTokenForTicket(id, ticketCode);
}

router.get("/mine", async (req, res) => {
  const tickets = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT t."id", t."event_id" AS "eventId", t."event_ticket_order_id" AS "orderId",
      t."event_ticket_type_id" AS "ticketTypeId", t."attendee_name" AS "attendeeName",
      t."attendee_email" AS "attendeeEmail", t."attendee_phone" AS "attendeePhone",
      t."ticket_code" AS "ticketCode", t."status", t."issued_at" AS "issuedAt",
      t."checked_in_at" AS "checkedInAt", t."cancelled_at" AS "cancelledAt", t."refunded_at" AS "refundedAt",
      e."title" AS "eventTitle", e."startDate" AS "eventStartDate", e."endDate" AS "eventEndDate",
      e."venue" AS "venue", e."city" AS "city", e."coverImageUrl" AS "coverImageUrl",
      tt."name" AS "ticketTypeName", o."quantity" AS "orderQuantity",
      o."totalAmount" AS "orderTotalAmount", o."currency" AS "currency"
      FROM "event_tickets" t JOIN "events" e ON e."id" = t."event_id"
      JOIN "event_ticket_types" tt ON tt."id" = t."event_ticket_type_id"
      JOIN "event_ticket_orders" o ON o."id" = t."event_ticket_order_id"
      WHERE t."user_id" = $1 ORDER BY t."created_at" DESC`
    , req.user!.id);
  res.json({ tickets });
});

router.get("/:id", async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT t."id", t."event_id" AS "eventId", t."event_ticket_order_id" AS "orderId",
      t."event_ticket_type_id" AS "ticketTypeId", t."attendee_name" AS "attendeeName",
      t."attendee_email" AS "attendeeEmail", t."attendee_phone" AS "attendeePhone",
      t."ticket_code" AS "ticketCode", t."status", t."issued_at" AS "issuedAt",
      t."checked_in_at" AS "checkedInAt", t."cancelled_at" AS "cancelledAt", t."refunded_at" AS "refundedAt",
      e."title" AS "eventTitle", e."description" AS "eventDescription", e."startDate" AS "eventStartDate",
      e."endDate" AS "eventEndDate", e."venue" AS "venue", e."city" AS "city", e."coverImageUrl" AS "coverImageUrl",
      tt."name" AS "ticketTypeName", tt."description" AS "ticketTypeDescription",
      o."status" AS "orderStatus", o."totalAmount" AS "orderTotalAmount", o."currency" AS "currency"
      FROM "event_tickets" t JOIN "events" e ON e."id" = t."event_id"
      JOIN "event_ticket_types" tt ON tt."id" = t."event_ticket_type_id"
      JOIN "event_ticket_orders" o ON o."id" = t."event_ticket_order_id"
      WHERE t."id" = $1 AND t."user_id" = $2 LIMIT 1`
    , req.params.id, req.user!.id);
  if (!rows[0]) return res.status(404).json({ error: "Ticket not found" });
  res.json({ ticket: rows[0] });
});

router.get("/:id/qr", async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; ticketCode: string; status: string }>>(
    `SELECT "id", "ticket_code" AS "ticketCode", "status" FROM "event_tickets"
      WHERE "id" = $1 AND "user_id" = $2 LIMIT 1`
    , req.params.id, req.user!.id);
  const ticket = rows[0];
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status !== "ACTIVE") return res.status(409).json({ error: "This ticket does not have a usable QR code" });
  const payload = qrPayloadForTicket(ticket.id, ticket.ticketCode);
  const qrImage = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 512 });
  res.json({ ticketId: ticket.id, ticketCode: ticket.ticketCode, payload, qrImage });
});

export async function resolveTicketQrPayload(payload: string) {
  return getEventTicketByQrPayload(payload);
}

export default router;
