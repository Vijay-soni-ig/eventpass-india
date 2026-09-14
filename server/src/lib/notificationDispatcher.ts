import { Prisma } from "@prisma/client";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import {
  claimNotificationIntent,
  markNotificationIntentCompleted,
  markNotificationIntentRetryOrDead,
  type NotificationChannel,
} from "./notificationOutboxService";
import {
  claimNotificationDelivery,
  markNotificationDeliverySent,
  scheduleNotificationDeliveryRetry,
  markNotificationDeliveryFailed,
} from "./notificationDeliveryService";
import { sendInApp, sendEmail, sendPush, type RenderedContent } from "./notificationProviders";

// Phase 31 (FP-06) — Notification dispatcher.
//
// FP-05 proved an intent gets ENQUEUED durably. It never proved anyone
// actually RECEIVES it — enqueue and dequeue were two disconnected halves of
// the notification foundation (see docs/notification-foundation-
// implementation-plan.md steps 3-10, entirely unbuilt before this file).
// This closes that gap for exactly one event type today
// (STALL_RESERVATION_EXPIRED) via one real channel (IN_APP, bridging into
// the existing notifications table/UI) plus mock EMAIL/PUSH adapters that
// prove the pipeline shape without claiming to actually send anything (no
// real provider credentials exist anywhere in this stack).
//
// RUN MODEL: an in-process interval loop (see runDispatcherTick, wired from
// server/src/index.ts behind NOTIFICATION_DISPATCHER_ENABLED, default off).
// No new infrastructure — this app has no cron/worker/queue process anywhere
// (the same constraint FP-05's stallReservationExpiry.ts documents), and a
// single long-lived Node process per container is exactly what's already
// deployed (server/Dockerfile). If ever scaled to multiple API instances,
// the claim functions' row-locking/lease pattern (already built, previously
// unused) is what makes that safe — nothing here assumes a single worker.
export const MAX_INTENT_ATTEMPTS = 5;
export const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;

export function backoffDelayMs(attempts: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_MS);
}

interface ResolvedRecipient {
  userId: string;
  channels: NotificationChannel[];
}

type Resolver = (payload: Record<string, unknown>, entityId: string) => Promise<ResolvedRecipient[]>;

// Recipient resolution is intentionally per-event-type: "who should be
// notified" is domain knowledge the dispatcher itself shouldn't hardcode
// beyond this registry. Only one event type is ever enqueued today
// (stallReservationExpiry.ts) — an intent whose eventType has no entry here
// is dead-lettered cleanly (see processOneIntent) rather than crashing.
async function resolveStallReservationExpired(
  _payload: Record<string, unknown>,
  participationId: string,
): Promise<ResolvedRecipient[]> {
  const participation = await prisma.exhibitionExhibitor.findUnique({
    where: { id: participationId },
    select: { business: { select: { ownerId: true } } },
  });
  if (!participation?.business?.ownerId) return [];
  return [{ userId: participation.business.ownerId, channels: ["IN_APP", "EMAIL"] }];
}

const RESOLVERS: Record<string, Resolver> = {
  STALL_RESERVATION_EXPIRED: resolveStallReservationExpired,
};

function renderContent(eventType: string): RenderedContent {
  if (eventType === "STALL_RESERVATION_EXPIRED") {
    return {
      title: "Stall reservation expired",
      body:
        "Your reserved stall was released back to availability because payment wasn't completed within the reservation window. You can select a stall again from My Participations.",
      actionUrl: "/exhibitor-dashboard/participations",
    };
  }
  return { title: "Notification", body: "You have a new notification.", actionUrl: "/" };
}

/** No preference row means enabled — matches the existing NotificationPreference model's convention of defaulting every toggle to true. */
async function isChannelEnabled(userId: string, eventType: string, channel: NotificationChannel): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ enabled: boolean }>>(Prisma.sql`
    SELECT enabled FROM notification_channel_preferences
    WHERE user_id = ${userId} AND event_type = ${eventType} AND channel = ${channel}
    LIMIT 1
  `);
  return rows.length === 0 ? true : rows[0].enabled;
}

/**
 * Claims and fully processes one pending intent: resolves recipients, fans
 * out into delivery rows (one per recipient/channel, SUPPRESSED instead of
 * PENDING if the recipient disabled that channel — kept as an audited row,
 * not silently dropped), then marks the intent COMPLETED.
 *
 * Delivery creation is idempotent via notification_deliveries' existing
 * (intent_id, recipient_user_id, channel) unique constraint + ON CONFLICT DO
 * NOTHING — safe to re-run if a crash happens between creating some
 * deliveries and marking the intent COMPLETED (exactly the "restart
 * recovery" scenario).
 *
 * An unresolvable event type or recipient is a permanent condition, not a
 * transient one — dead-lettered immediately rather than retried. Any other
 * unexpected error retries with backoff up to MAX_INTENT_ATTEMPTS, then
 * dead-letters.
 */
export async function processOneIntent(workerId: string): Promise<"processed" | "empty"> {
  const intent = await claimNotificationIntent(workerId);
  if (!intent) return "empty";

  try {
    const resolver = RESOLVERS[intent.eventType];
    if (!resolver) {
      await deadLetterIntent(intent.id, workerId, `No recipient resolver registered for event type "${intent.eventType}"`, "no_resolver");
      return "processed";
    }
    if (!intent.entityId) {
      await deadLetterIntent(intent.id, workerId, "Intent has no entityId to resolve a recipient from", "missing_entity_id");
      return "processed";
    }

    const payload = (intent.payload ?? {}) as Record<string, unknown>;
    const recipients = await resolver(payload, intent.entityId);

    if (recipients.length === 0) {
      await deadLetterIntent(intent.id, workerId, "No recipient could be resolved for this intent", "no_recipient");
      return "processed";
    }

    for (const recipient of recipients) {
      for (const channel of recipient.channels) {
        const enabled = await isChannelEnabled(recipient.userId, intent.eventType, channel);
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO notification_deliveries (intent_id, recipient_user_id, channel, status, available_at)
          VALUES (${intent.id}, ${recipient.userId}, ${channel}, ${enabled ? "PENDING" : "SUPPRESSED"}, NOW())
          ON CONFLICT (intent_id, recipient_user_id, channel) DO NOTHING
        `);
      }
    }

    await markNotificationIntentCompleted(intent.id, workerId);
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown intent processing error";
    if (intent.attempts >= MAX_INTENT_ATTEMPTS) {
      await deadLetterIntent(intent.id, workerId, message, "max_attempts_exceeded");
    } else {
      await markNotificationIntentRetryOrDead(intent.id, workerId, message, "retry", new Date(Date.now() + backoffDelayMs(intent.attempts)));
    }
    return "processed";
  }
}

async function deadLetterIntent(intentId: string, workerId: string, message: string, reason: string): Promise<void> {
  await markNotificationIntentRetryOrDead(intentId, workerId, message, "dead_letter");
  await logAudit({
    actorUserId: null,
    action: "notification.intent_dead_letter",
    entityType: "NotificationIntent",
    entityId: intentId,
    metadata: { reason, error: message },
  });
}

/**
 * Claims and processes one pending delivery: looks up its parent intent for
 * event type/payload, renders content, dispatches through the channel's
 * provider, and records the outcome. A transient failure schedules a retry
 * with backoff; exhausting MAX_DELIVERY_ATTEMPTS marks it FAILED (this is
 * the delivery-level "dead letter" — the NotificationDeliveryStatus type has
 * no separate DEAD_LETTER state, only FAILED, unlike intents).
 */
export async function processOneDelivery(workerId: string): Promise<"processed" | "empty"> {
  const delivery = await claimNotificationDelivery(workerId);
  if (!delivery) return "empty";

  try {
    const intentRows = await prisma.$queryRaw<Array<{ event_type: string; entity_id: string | null; payload: unknown }>>(Prisma.sql`
      SELECT event_type, entity_id, payload FROM notification_intents WHERE id = ${delivery.intentId} LIMIT 1
    `);
    const intent = intentRows[0];
    if (!intent) {
      await markNotificationDeliveryFailed(delivery.id, workerId, "Parent intent no longer exists");
      return "processed";
    }

    const payload = (intent.payload ?? {}) as Record<string, unknown>;
    const content = renderContent(intent.event_type);
    const forceFailUntilAttempt =
      typeof payload.__testForceFailUntilAttempt === "number" ? (payload.__testForceFailUntilAttempt as number) : undefined;

    let result: Awaited<ReturnType<typeof sendEmail>>;
    if (delivery.channel === "IN_APP") {
      result = await sendInApp({
        recipientUserId: delivery.recipientUserId,
        notificationType: intent.event_type as NotificationType,
        entityType: "ExhibitionExhibitor",
        entityId: intent.entity_id ?? delivery.intentId,
        sourceVersion: delivery.intentId,
        content,
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
      await logAudit({
        actorUserId: null,
        action: "notification.delivery_failed",
        entityType: "NotificationDelivery",
        entityId: delivery.id,
        metadata: { channel: delivery.channel, error: result.error, attempts: delivery.attempts },
      });
    } else {
      await scheduleNotificationDeliveryRetry(
        delivery.id,
        workerId,
        result.error ?? "Unknown transient failure",
        new Date(Date.now() + backoffDelayMs(delivery.attempts)),
      );
    }
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown delivery processing error";
    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await markNotificationDeliveryFailed(delivery.id, workerId, message);
    } else {
      await scheduleNotificationDeliveryRetry(delivery.id, workerId, message, new Date(Date.now() + backoffDelayMs(delivery.attempts)));
    }
    return "processed";
  }
}

export interface DispatchTickResult {
  intentsProcessed: number;
  deliveriesProcessed: number;
}

/** Drains up to maxPerTick pending intents, then up to maxPerTick pending deliveries. Intents are processed first each tick so a freshly-enqueued intent's deliveries can be picked up in the very same tick rather than waiting a full interval. */
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
