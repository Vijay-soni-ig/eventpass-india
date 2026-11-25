import assert from "node:assert/strict";
import { test } from "node:test";
import { getTicketInventoryUsage } from "../src/lib/ticketInventory";

test("ticket inventory reads legacy bookings, active reservations, and paid orders in one snapshot query", async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join("?"), values });
      return [{
        legacyBookedQuantity: 5n,
        activeReservationQuantity: 3n,
        paidOrderQuantity: 13n,
      }];
    },
  } as unknown as Parameters<typeof getTicketInventoryUsage>[0];

  const usage = await getTicketInventoryUsage(
    client,
    { legacyTicketTypeId: "legacy-ticket-type", eventTicketTypeId: "event-ticket-type" },
    new Date("2026-11-25T12:00:00.000Z"),
  );

  assert.equal(statements.length, 1, "all inventory sources must share one PostgreSQL statement snapshot");
  assert.match(statements[0].sql, /ticket_bookings/);
  assert.match(statements[0].sql, /event_ticket_reservations/);
  assert.match(statements[0].sql, /event_ticket_orders/);
  assert.match(statements[0].sql, /NOT EXISTS/);
  assert.deepEqual(usage, {
    legacyBookedQuantity: 5,
    activeReservationQuantity: 3,
    paidOrderQuantity: 13,
    totalConsumedQuantity: 21,
  });
});

test("ticket inventory returns zero for unmapped sources without issuing separate reads", async () => {
  let queryCount = 0;
  const client = {
    $queryRaw: async () => {
      queryCount += 1;
      return [{
        legacyBookedQuantity: 0n,
        activeReservationQuantity: 0n,
        paidOrderQuantity: 0n,
      }];
    },
  } as unknown as Parameters<typeof getTicketInventoryUsage>[0];

  const usage = await getTicketInventoryUsage(client, { legacyTicketTypeId: null, eventTicketTypeId: null });

  assert.equal(queryCount, 1);
  assert.deepEqual(usage, {
    legacyBookedQuantity: 0,
    activeReservationQuantity: 0,
    paidOrderQuantity: 0,
    totalConsumedQuantity: 0,
  });
});
