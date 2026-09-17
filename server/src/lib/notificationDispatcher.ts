import { Prisma } from "@prisma/client";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { claimNotificationIntent, markNotificationIntentCompleted, markNotificationIntentRetryOrDead, type NotificationChannel } from "./notificationOutboxService";
import { claimNotificationDelivery, markNotificationDeliverySent, markNotificationDeliverySuppressed, scheduleNotificationDeliveryRetry, markNotificationDeliveryFailed } from "./notificationDeliveryService";
import { sendInApp, sendEmail, sendPush } from "./notificationProviders";
import { getNotificationEvent } from "./notificationEventRegistry";
import { getNotificationTemplate, renderNotificationTemplate } from "./notificationTemplates";

export const MAX_INTENT_ATTEMPTS = 5;
export const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;

export function backoffDelayMs(attempts: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS);
}

export function renderContent(eventType: string, payload: Record<string, unknown>, entityId: string) {
  return renderNotificationTemplate({ eventType, payload, entityId });
}

async function isChannelEnabled(userId: string, eventType: string, channel: NotificationChannel): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ enabled: boolean }>>(Prisma.sql`
    SELECT enabled FROM notification_channel_preferences
    WHERE user_id = ${userId} AND event_type = ${eventType} AND channel = ${channel}
    LIMIT 1
  `);
  return rows.length === 0 ? true : rows[0].enabled;
}

export async function processOneIntent(workerId: string): Promise<"processed" | "empty"> {
  const intent = await claimNotificationIntent(workerId);
  if (!intent) return "empty";

  try {
    const event = getNotificationEvent(intent.eventType);
    const template = getNotificationTemplate(intent.eventType);
    if (!event || !template) {
      await deadLetterIntent(intent.id, workerId, `No notification definition/template registered for event type "${intent.eventType}"`, "no_handler");
      return "processed";
    }
    if (!intent.entityId) {
      await deadLetterIntent(intent.id, workerId, "Intent has no entityId to resolve a recipient from", "missing_entity_id");
      return "processed";
    }

    const payload = (intent.payload ?? {}) as Record<string, unknown>;
    const recipients = await event.resolveRecipients(payload, intent.entityId);
    if (recipients.length === 0) {
      await deadLetterIntent(intent.id, workerId, "No recipient could be resolved for this intent", "no_recipient");
      return "processed";
    }

    for (const recipient of recipients) {
      for (const channel of recipient.channels) {
        if (!template.channels.includes(channel)) continue;
        const enabled = await isChannelEnabled(recipient.userId, intent.eventType, channel);
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO notification_deliveries (intent_id, recipient_user_id, channel, status, template_key, available_at)
          VALUES (${intent.id}, ${recipient.userId}, ${channel}, ${enabled ? "PENDING" : "SUPPRESSED"}, ${template.key}, NOW())
          ON CONFLICT (intent_id, recipient_user_id, channel) DO NOTHING
        `);
      }
    }

    await markNotificationIntentCompleted(intent.id, workerId);
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown intent processing error";
    if (intent.attempts >= MAX_INTENT_ATTEMPTS) await deadLetterIntent(intent.id, workerId, message, "max_attempts_exceeded");
    else await markNotificationIntentRetryOrDead(intent.id, workerId, message, "retry", new Date(Date.now() + backoffDelayMs(intent.attempts)));
    return "processed";
  }
}

async function deadLetterIntent(intentId: string, workerId: string, message: string, reason: string): Promise<void> {
  await markNotificationIntentRetryOrDead(intentId, workerId, message, "dead_letter");
  await logAudit({ actorUserId: null, action: "notification.intent_dead_letter", entityType: "NotificationIntent", entityId: intentId, metadata: { reason, error: message } });
}

export async function processOneDelivery(workerId: string): Promise<"processed" | "empty"> {
  const delivery = await claimNotificationDelivery(workerId);
  if (!delivery) return "empty";

  try {
    const intentRows = await prisma.$queryRaw<Array<{ event_type: string; entity_type: string | null; entity_id: string | null; payload: unknown }>>(Prisma.sql`
      SELECT event_type, entity_type, entity_id, payload FROM notification_intents WHERE id = ${delivery.intentId} LIMIT 1
    `);
    const intent = intentRows[0];
    if (!intent) {
      await markNotificationDeliveryFailed(delivery.id, workerId, "Parent intent no longer exists");
      return "processed";
    }

    // Preferences are authoritative at the moment a delivery is actually sent.
    // A user can change a channel after intent expansion but before this worker
    // claims the delivery, so checking only in processOneIntent is not enough.
    // Re-check here immediately before invoking the provider to avoid sending
    // a notification after the user has disabled that channel.
    if (!(await isChannelEnabled(delivery.recipientUserId, intent.event_type, delivery.channel as NotificationChannel))) {
      await markNotificationDeliverySuppressed(delivery.id, workerId, "Channel disabled by recipient preference");
      return "processed";
    }

    const payload = (intent.payload ?? {}) as Record<string, unknown>;
    const rendered = renderContent(intent.event_type, payload, intent.entity_id ?? delivery.intentId);
    if (!rendered) {
      await markNotificationDeliveryFailed(delivery.id, workerId, `No template registered for event type "${intent.event_type}"`);
      await logAudit({ actorUserId: null, action: "notification.delivery_failed", entityType: "NotificationDelivery", entityId: delivery.id, metadata: { reason: "no_template", eventType: intent.event_type } });
      return "processed";
    }
    const { content } = rendered;
    const forceFailUntilAttempt = typeof payload.__testForceFailUntilAttempt === "number" ? payload.__testForceFailUntilAttempt : undefined;

    let result: Awaited<ReturnType<typeof sendEmail>>;
    if (delivery.channel === "IN_APP") {
      result = await sendInApp({
        recipientUserId: delivery.recipientUserId,
        notificationType: intent.event_type as NotificationType,
        entityType: intent.entity_type ?? "Notification",
        entityId: intent.entity_id ?? delivery.intentId,
        sourceVersion: delivery.intentId,
        content,
        organizerId: typeof payload.organizerId === "string" ? payload.organizerId : null,
      });
    } else if (delivery.channel === "EMAIL") {
      result = await sendEmail({ recipientUserId: delivery.recipientUserId, content, attempts: delivery.attempts, forceFailUntilAttempt });
    } else {
      result = await sendPush({ recipientUserId: delivery.recipientUserId, content, attempts: delivery.attempts, forceFailUntilAttempt });
    }

    if (result.success) {
      await markNotificationDeliverySent(delivery.id, workerId, result.providerMessageId);
    } else if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await markNotificationDeliveryFailed(delivery.id, workerId, result.error ?? "Unknown delivery failure");
      await logAudit({ actorUserId: null, action: "notification.delivery_failed", entityType: "NotificationDelivery", entityId: delivery.id, metadata: { channel: delivery.channel, error: result.error, attempts: delivery.attempts } });
    } else {
      await scheduleNotificationDeliveryRetry(delivery.id, workerId, result.error ?? "Unknown transient failure", new Date(Date.now() + backoffDelayMs(delivery.attempts)));
    }
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown delivery processing error";
    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) await markNotificationDeliveryFailed(delivery.id, workerId, message);
    else await scheduleNotificationDeliveryRetry(delivery.id, workerId, message, new Date(Date.now() + backoffDelayMs(delivery.attempts)));
    return "processed";
  }
}

export interface DispatchTickResult { intentsProcessed: number; deliveriesProcessed: number; }

export async function runDispatcherTick(workerId: string, maxPerTick = 20): Promise<DispatchTickResult> {
  let intentsProcessed = 0;
  for (let i = 0; i < maxPerTick; i++) {
    if ((await processOneIntent(workerId)) === "empty") break;
    intentsProcessed++;
  }
  let deliveriesProcessed = 0;
  for (let i = 0; i < maxPerTick; i++) {
    if ((await processOneDelivery(workerId)) === "empty") break;
    deliveriesProcessed++;
  }
  return { intentsProcessed, deliveriesProcessed };
}
