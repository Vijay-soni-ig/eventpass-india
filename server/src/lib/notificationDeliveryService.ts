import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_WAIT'
  | 'SUPPRESSED'
  | 'CANCELLED';

export interface ClaimedNotificationDelivery {
  id: string;
  intentId: string;
  recipientUserId: string;
  channel: string;
  provider: string | null;
  templateKey: string | null;
  renderedPayload: unknown;
  attempts: number;
}

/**
 * Claims one delivery using a short lease so multiple workers cannot process
 * the same delivery concurrently. The database update is the concurrency
 * control; callers must not perform a separate read-before-claim.
 */
export async function claimNotificationDelivery(
  workerId: string,
): Promise<ClaimedNotificationDelivery | null> {
  const claimed = await prisma.$queryRaw<ClaimedNotificationDelivery[]>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM notification_deliveries
      WHERE status IN ('PENDING', 'RETRY_WAIT')
        AND available_at <= NOW()
        AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
      ORDER BY created_at ASC
      LIMIT 1
    )
    UPDATE notification_deliveries delivery
    SET status = 'PROCESSING',
        attempts = delivery.attempts + 1,
        locked_at = NOW(),
        locked_by = ${workerId},
        updated_at = NOW()
    FROM candidate
    WHERE delivery.id = candidate.id
    RETURNING
      delivery.id,
      delivery.intent_id AS "intentId",
      delivery.recipient_user_id AS "recipientUserId",
      delivery.channel,
      delivery.provider,
      delivery.template_key AS "templateKey",
      delivery.rendered_payload AS "renderedPayload",
      delivery.attempts
  `);

  return claimed[0] ?? null;
}

export async function markNotificationDeliverySent(
  deliveryId: string,
  workerId: string,
  providerMessageId?: string,
): Promise<boolean> {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_deliveries
    SET status = 'SENT',
        provider_message_id = ${providerMessageId ?? null},
        sent_at = NOW(),
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${deliveryId}
      AND status = 'PROCESSING'
      AND locked_by = ${workerId}
  `);

  return result === 1;
}

export async function scheduleNotificationDeliveryRetry(
  deliveryId: string,
  workerId: string,
  errorMessage: string,
  retryAt: Date,
): Promise<boolean> {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_deliveries
    SET status = 'RETRY_WAIT',
        available_at = ${retryAt},
        last_error = ${errorMessage},
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${deliveryId}
      AND status = 'PROCESSING'
      AND locked_by = ${workerId}
  `);

  return result === 1;
}

export async function markNotificationDeliveryFailed(
  deliveryId: string,
  workerId: string,
  errorMessage: string,
): Promise<boolean> {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_deliveries
    SET status = 'FAILED',
        last_error = ${errorMessage},
        locked_at = NULL,
        locked_by = NULL,
        updated_at = NOW()
    WHERE id = ${deliveryId}
      AND status = 'PROCESSING'
      AND locked_by = ${workerId}
  `);

  return result === 1;
}
