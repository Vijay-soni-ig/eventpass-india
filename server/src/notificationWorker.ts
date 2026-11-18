import { randomUUID } from "crypto";
import { prisma } from "./lib/prisma";
import { runDispatcherTick } from "./lib/notificationDispatcher";
import { getNotificationWorkerConfig } from "./lib/notificationWorkerConfig";

async function main(): Promise<void> {
  const { intervalMs } = getNotificationWorkerConfig();
  const workerId = "notification-worker-" + randomUUID();
  let shuttingDown = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let activeTick: Promise<void> | null = null;
  let lastHeartbeatAt = 0;

  console.log(JSON.stringify({
    event: "notification_worker_started",
    workerId,
    intervalMs,
    emailProvider: "resend",
  }));

  const scheduleNext = () => {
    if (!shuttingDown) timer = setTimeout(() => void runTick(), intervalMs);
  };

  const runTick = async () => {
    if (shuttingDown || activeTick) return;
    activeTick = (async () => {
      const startedAt = Date.now();
      try {
        const result = await runDispatcherTick(workerId);
        const now = Date.now();
        if (result.intentsProcessed > 0 || result.deliveriesProcessed > 0 || now - lastHeartbeatAt >= 60_000) {
          console.log(JSON.stringify({
            event: "notification_worker_heartbeat",
            workerId,
            intentsProcessed: result.intentsProcessed,
            deliveriesProcessed: result.deliveriesProcessed,
            durationMs: now - startedAt,
          }));
          lastHeartbeatAt = now;
        }
      } catch (error) {
        console.error(JSON.stringify({
          event: "notification_worker_tick_failed",
          workerId,
          message: error instanceof Error ? error.message : "Unknown dispatcher error",
        }));
      }
    })();

    try {
      await activeTick;
    } finally {
      activeTick = null;
      scheduleNext();
    }
  };

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (timer) clearTimeout(timer);
    console.log(JSON.stringify({ event: "notification_worker_stopping", workerId, signal }));
    try {
      if (activeTick) await activeTick;
      await prisma.$disconnect();
      console.log(JSON.stringify({ event: "notification_worker_stopped", workerId }));
      process.exitCode = 0;
    } catch (error) {
      console.error("Notification worker shutdown failed:", error);
      process.exitCode = 1;
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  await runTick();
}

main().catch(async (error) => {
  console.error("Notification worker failed to start:", error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
