import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function qrSigningSecret() {
  const secret = process.env.TICKET_QR_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("TICKET_QR_SECRET or JWT_SECRET is required for QR ticket signing");
  return secret;
}

function qrTokenForTicket(id: string, ticketCode: string) {
  return createHmac("sha256", qrSigningSecret()).update(id + "." + ticketCode).digest("base64url");
}

export function buildQrPayload(ticketId: string, ticketCode: string) {
  return `ETX1.${ticketCode}.${qrTokenForTicket(ticketId, ticketCode)}`;
}

export async function issueEventTicketsForPaidOrder(db: Db, orderId: string) {
  // Serialize issuance per order. This makes payment/webhook retries safe even
  // if two verified callbacks race before either transaction commits.
  await db.$queryRawUnsafe(
    `SELECT "id" FROM "event_ticket_orders" WHERE "id" = $1 FOR UPDATE`,
    orderId,
  );

  const orderRows = await db.$queryRawUnsafe<Array<{
    id: string;
    eventId: string;
    eventTicketTypeId: string;
    userId: string;
    quantity: number;
    status: string;
    attendee_name: string;
    attendee_email: string;
    attendee_phone: string | null;
  }>>(
    `SELECT o."id", o."eventId", r."eventTicketTypeId", o."userId", o."quantity", o."status",
            r."attendeeName" AS "attendee_name",
            r."attendeeEmail" AS "attendee_email",
            r."attendeePhone" AS "attendee_phone"
       FROM "event_ticket_orders" o
       INNER JOIN "event_ticket_reservations" r ON r."id" = o."reservationId"
      WHERE o."id" = $1`,
    orderId,
  );
  const order = orderRows[0];
  if (!order) throw new Error("EVENT_TICKET_ORDER_NOT_FOUND");
  if (order.status !== "PAID") return [];

  const existing = await db.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "event_tickets" WHERE "event_ticket_order_id" = $1 ORDER BY "created_at" ASC`,
    orderId,
  );
  if (existing.length >= order.quantity) {
    return db.$queryRawUnsafe(
      `SELECT * FROM "event_tickets" WHERE "event_ticket_order_id" = $1 ORDER BY "created_at" ASC`,
      orderId,
    );
  }

  const missing = order.quantity - existing.length;
  // The reservation captures the attendee identity entered during checkout.
  // Do not replace it with the purchasing account's profile: one account may
  // legitimately buy tickets for other attendees.
  const attendee = {
    name: order.attendee_name,
    email: order.attendee_email,
    phone: order.attendee_phone,
  };
  if (!attendee.name || !attendee.email) throw new Error("EVENT_TICKET_ATTENDEE_NOT_FOUND");

  const tickets = [];
  for (let i = 0; i < missing; i += 1) {
    const id = randomUUID();
    const ticketCode = `ETX-${randomBytes(5).toString("hex").toUpperCase()}`;
    const qrPayload = buildQrPayload(id, ticketCode);
    const rawToken = qrPayload.split(".")[2];
    const qrTokenHash = hashQrToken(rawToken);

    await db.$executeRawUnsafe(
      `INSERT INTO "event_tickets"
        ("id","event_id","event_ticket_order_id","event_ticket_type_id","user_id",
         "attendee_name","attendee_email","attendee_phone","ticket_code","qr_token_hash",
         "status","issued_at","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      order.eventId,
      order.id,
      order.eventTicketTypeId,
      order.userId,
      attendee.name,
      attendee.email,
      attendee.phone,
      ticketCode,
      qrTokenHash,
    );

    tickets.push({
      id,
      eventId: order.eventId,
      orderId: order.id,
      ticketTypeId: order.eventTicketTypeId,
      userId: order.userId,
      attendeeName: attendee.name,
      attendeeEmail: attendee.email,
      attendeePhone: attendee.phone,
      ticketCode,
      qrPayload,
      status: "ACTIVE",
    });
  }

  return tickets;
}

export async function getEventTicketByQrPayload(qrPayload: string) {
  const parts = qrPayload.split(".");
  if (parts.length !== 3 || parts[0] !== "ETX1") return null;
  const [, ticketCode, rawToken] = parts;
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown> & { id: string; qr_token_hash: string }>>(
    `SELECT "id","event_id","event_ticket_order_id","event_ticket_type_id","user_id",
            "attendee_name","attendee_email","attendee_phone","ticket_code","status",
            "issued_at","checked_in_at","cancelled_at","refunded_at","qr_token_hash"
       FROM "event_tickets"
      WHERE "ticket_code" = $1
      LIMIT 1`,
    ticketCode,
  );
  const ticket = rows[0];
  if (!ticket) return null;
  const expectedHash = Buffer.from(hashQrToken(qrTokenForTicket(ticket.id, ticketCode)));
  const storedHash = Buffer.from(ticket.qr_token_hash);
  if (expectedHash.length !== storedHash.length || !timingSafeEqual(expectedHash, storedHash)) return null;
  return ticket;
}
