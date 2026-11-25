/**
 * ETX-EVENT-001B — one-off/rerunnable Event backfill CLI.
 *
 * Creates exactly one Event per Exhibition that doesn't already have one,
 * links Exhibition.eventId, and idempotently mirrors legacy TicketType rows
 * to EventTicketType. It never rewrites TicketBooking/StallBooking/
 * FloorPlan/CheckIn/Lead/Payment/Refund rows and does not change checkout
 * behavior — Exhibition remains the ticket write source of truth until the
 * separate checkout cutover. See server/src/lib/eventBackfill.ts and
 * docs/product/UNIVERSAL_EVENT_FOUNDATION.md.
 *
 * Usage:
 *   cd server
 *   npx tsx prisma/backfillEvents.ts
 */
import { backfillEvents, verifyEventBackfillInvariants, verifyEventTicketTypeMappingInvariants } from "../src/lib/eventBackfill";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await backfillEvents();
  console.log("Event backfill complete:", result);

  const mismatches = await verifyEventBackfillInvariants();
  if (mismatches.length > 0) {
    console.error(`Invariant check FAILED: ${mismatches.length} mismatch(es)`);
    console.error(JSON.stringify(mismatches, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log("Invariant check PASSED: every linked Exhibition matches its Event.");

  const ticketTypeMismatches = await verifyEventTicketTypeMappingInvariants();
  if (ticketTypeMismatches.length > 0) {
    console.error(`Ticket type mapping invariant check FAILED: ${ticketTypeMismatches.length} mismatch(es)`);
    console.error(JSON.stringify(ticketTypeMismatches, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log("Ticket type mapping invariant check PASSED: every linked legacy TicketType matches its EventTicketType mirror.");
}

main()
  .catch((error) => {
    console.error("Event backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
