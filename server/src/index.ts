import { randomUUID } from "crypto";
import { app } from "./app";
import { prisma } from "./lib/prisma";
import { runDispatcherTick } from "./lib/notificationDispatcher";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

// Phase 31 (FP-06) — flag-gated, default off. This is new, previously-
unexercised background-job code; shipping it disabled by default lets it
be deployed and turned on deliberately rather than silently starting to
process production data the moment this code reaches main. See
server/src/lib/notificationDispatcher.ts for why the in-process interval is
currently the run model (no separate worker infrastructure exists in this
stack).
let dispatcherInterval: ReturnType<typeof setInterval> | null = null;
let dispatcherRunning = false;

if (process.env.NOTIFICATION_DISPATCHER_ENABLED === "true") {
  const workerId = `dispatcher-${randomUUID()}`;
  const intervalMs = Math.max(1000, Number(process.env.NOTIFICATION_DISPATCHER_INTERVAL_MS) || 15000);

  const runDispatcher = async () => {
    // Prevent overlapping ticks in the same API process. Database leases still
    // protect against multiple processes, but avoiding local overlap reduces
    // unnecessary DB contention and duplicate claim attempts.
    if (dispatcherRunning || shuttingDown) return;
    dispatcherRunning = true;
    try {
      const result = await runDispatcherTick(workerId);
      if (result.intentsProcessed > 0 || result.deliveriesProcessed > 0) {
        console.log(JSON.stringify({
          event: "notification_dispatcher_tick",
          workerId,
          intentsProcessed: result.intentsProcessed,
          deliveriesProcessed: result.deliveriesProcessed,
        }));
      }
    } catch (error) {
      console.error("Notification dispatcher tick failed:", error);
    } finally {
      dispatcherRunning = false;
    }
  };

  console.log(`Notification dispatcher enabled (workerId=${workerId}, intervalMs=${intervalMs})`);
  dispatcherInterval = setInterval(() => void runDispatcher(), intervalMs);
  // Drain immediately after startup instead of waiting for the first interval.
  void runDispatcher();
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);

  if (dispatcherInterval) clearInterval(dispatcherInterval);

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