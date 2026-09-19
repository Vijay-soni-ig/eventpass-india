import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildQrPayload(ticketCode: string, rawToken: string) {
  return `ETX1.${ticketCode}.${rawToken}`;
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
    event_id: string;
    event_ticket_type_id: string;
    user_id: string;
    quantity: number;
    status: string;
  }>>(
    `SELECT "id", "event_id", "event_ticket_type_id", "user_id", "quantity", "status"
     FROM "event_ticket_orders" WHERE "id" = $1`,
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
  const userRows = await db.$queryRawUnsafe<Array<{
    full_name: string | null;
    email: string;
    phone: string | null;
  }>>(
    `SELECT "fullName" AS "full_name", "email", "phone" FROM "users" WHERE "id" = $1`,
    order.user_id,
  );
  const user = userRows[0];
  if (!user) throw new Error("EVENT_TICKET_USER_NOT_FOUND");

  const tickets = [];
  for (let i = 0; i < missing; i += 1) {
    const id = randomUUID();
    const ticketCode = `ETX-${randomBytes(5).toString("hex").toUpperCase()}`;
    const rawToken = randomBytes(32).toString("base64url");
    const qrTokenHash = hashQrToken(rawToken);

    await db.$executeRawUnsafe(
      `INSERT INTO "event_tickets"
        ("id","event_id","event_ticket_order_id","event_ticket_type_id","user_id",
         "attendee_name","attendee_email","attendee_phone","ticket_code","qr_token_hash",
         "status","issued_at","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      order.event_id,
      order.id,
      order.event_ticket_type_id,
      order.user_id,
      user.full_name ?? user.email,
      user.email,
      user.phone,
      ticketCode,
      qrTokenHash,
    );

    tickets.push({
      id,
      eventId: order.event_id,
      orderId: order.id,
      ticketTypeId: order.event_ticket_type_id,
      userId: order.user_id,
      attendeeName: user.full_name ?? user.email,
      attendeeEmail: user.email,
      attendeePhone: user.phone,
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
  const [_, ticketCode, rawToken] = parts;
  const hash = hashQrToken(rawToken);
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id","event_id","event_ticket_order_id","event_ticket_type_id","user_id",
            "attendee_name","attendee_email","attendee_phone","ticket_code","status",
            "issued_at","checked_in_at","cancelled_at","refunded_at"
       FROM "event_tickets"
      WHERE "ticket_code" = $1 AND "qr_token_hash" = $2
      LIMIT 1`,
    ticketCode,
    hash,
  );
  return rows[0] ?? null;
}
