import { randomUUID } from "crypto";
import { app } from "./app";
import { prisma } from "./lib/prisma";
import { runDispatcherTick } from "./lib/notificationDispatcher";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

// Phase 31 (FP-06) — flag-gated, default off. This is new, previously-
// unexercised background-job code; shipping it disabled by default lets it
// be deployed and turned on deliberately rather than silently starting to
// process production data the moment this code reaches main. See
// server/src/lib/notificationDispatcher.ts for why an in-process interval is
// the run model (no cron/worker infrastructure exists anywhere in this
// stack).
let dispatcherInterval: ReturnType<typeof setInterval> | null = null;
if (process.env.NOTIFICATION_DISPATCHER_ENABLED === "true") {
  const workerId = `dispatcher-${randomUUID()}`;
  const intervalMs = Number(process.env.NOTIFICATION_DISPATCHER_INTERVAL_MS) || 15000;
  console.log(`Notification dispatcher enabled (workerId=${workerId}, intervalMs=${intervalMs})`);
  dispatcherInterval = setInterval(() => {
    runDispatcherTick(workerId).catch((error) => console.error("Notification dispatcher tick failed:", error));
  }, intervalMs);
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
