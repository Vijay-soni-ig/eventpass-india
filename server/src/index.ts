import { app } from "./app";
import { prisma } from "./lib/prisma";
import { expireEventTicketReservations } from "./lib/eventTicketReservationExpiry";
import { assertRateLimitTopology } from "./lib/rateLimitTopology";
import { assertMalwareScanConfig } from "./lib/malwareScanner";

assertRateLimitTopology();
assertMalwareScanConfig();

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

let shuttingDown = false;

// Phase 31 (FP-06) — flag-gated, default off. This is new, previously-
// unexercised background-job code; shipping it disabled by default lets it
// be deployed and turned on deliberately rather than silently starting to
// process production data the moment this code reaches main. See
// server/src/lib/notificationDispatcher.ts for why the in-process interval is
// currently the run model (no separate worker infrastructure exists in this
// stack).
let reservationExpiryInterval: ReturnType<typeof setInterval> | null = null;
let reservationExpiryRunning = false;

if (process.env.EVENT_TICKET_RESERVATION_EXPIRY_ENABLED === "true") {
  const intervalMs = Math.max(10_000, Number(process.env.EVENT_TICKET_RESERVATION_EXPIRY_INTERVAL_MS) || 30_000);
  const batchSize = Math.min(Math.max(Number(process.env.EVENT_TICKET_RESERVATION_EXPIRY_BATCH_SIZE) || 500, 1), 5000);

  const runReservationExpiry = async () => {
    if (reservationExpiryRunning || shuttingDown) return;
    reservationExpiryRunning = true;
    try {
      const result = await expireEventTicketReservations({ batchSize });
      if (result.expiredCount > 0) {
        console.log(JSON.stringify({
          event: "event_ticket_reservation_expiry",
          expiredCount: result.expiredCount,
        }));
      }
    } catch (error) {
      console.error("Event ticket reservation expiry failed:", error);
    } finally {
      reservationExpiryRunning = false;
    }
  };

  console.log(`Event ticket reservation expiry enabled (intervalMs=${intervalMs}, batchSize=${batchSize})`);
  reservationExpiryInterval = setInterval(() => void runReservationExpiry(), intervalMs);
  void runReservationExpiry();
}


async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);

  if (reservationExpiryInterval) clearInterval(reservationExpiryInterval);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      console.error("Database disconnect failed:", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));