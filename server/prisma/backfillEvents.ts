/**
 * ETX-EVENT-001B — one-off/rerunnable Event backfill CLI.
 *
 * Creates exactly one Event per Exhibition that doesn't already have one,
 * and links Exhibition.eventId to it. Idempotent: safe to run as many times
 * as you like. Never touches TicketBooking/StallBooking/FloorPlan/CheckIn/
 * Lead/Payment/Refund or any other Exhibition-dependent table, and never
 * changes API behavior — Exhibition remains the operational source of
 * truth. See server/src/lib/eventBackfill.ts and
 * docs/product/UNIVERSAL_EVENT_FOUNDATION.md.
 *
 * Usage:
 *   cd server
 *   npx tsx prisma/backfillEvents.ts
 */
import { backfillEvents, verifyEventBackfillInvariants } from "../src/lib/eventBackfill";
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
}

main()
  .catch((error) => {
    console.error("Event backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
