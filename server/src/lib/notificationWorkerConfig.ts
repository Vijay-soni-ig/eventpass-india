export interface NotificationWorkerConfig {
  intervalMs: number;
}

export function getNotificationWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotificationWorkerConfig {
  if (env.NOTIFICATION_DISPATCHER_ENABLED !== "true") {
    throw new Error("Notification worker is disabled. Set NOTIFICATION_DISPATCHER_ENABLED=true only for an explicitly enabled staging/production worker.");
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for the notification worker.");
  }
  if (!env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim()) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required before enabling notification delivery.");
  }

  const configuredInterval = Number(env.NOTIFICATION_DISPATCHER_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0
    ? Math.max(1000, Math.min(configuredInterval, 60_000))
    : 15_000;

  return { intervalMs };
}
