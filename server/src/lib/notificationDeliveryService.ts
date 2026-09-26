import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
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
/**
 * Phase 31 (FP-06) fix: also fixes a dead-code staleness check (a row stuck
 * in PROCESSING could never be reclaimed regardless of lock age, since the
 * original status filter only included PENDING/RETRY_WAIT) — see
 * claimNotificationIntent in notificationOutboxService.ts for the identical
 * issue and full explanation, including why this uses
 * `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)` rather than a
 * candidate-CTE-joined UPDATE: the CTE-join version was empirically
 * double-claiming the same row under real concurrency (reproducible every
 * time once the connection pool had more than one active connection) even
 * after adding a status/lock re-check to the final UPDATE's own WHERE
 * clause — Postgres's EvalPlanQual re-check on a lock conflict does not
 * reliably reapply a condition sourced from a joined CTE the way it does for
 * a plain WHERE clause on the target table. FOR UPDATE SKIP LOCKED avoids the
 * ambiguity entirely by taking the row lock during the SELECT itself.
 *
 * Also fixed at the schema level (migration 20260915100000): this table's
 * timestamp columns were originally plain TIMESTAMP (no time zone), which
 * made `locked_at < NOW() - INTERVAL '5 minutes'` wrong on any Postgres
 * session not configured for UTC — see the identical, fully-explained bug
 * in notificationOutboxService.ts's claimNotificationIntent. Every timestamp
 * column here is now TIMESTAMPTZ.
 */
export async function claimNotificationDelivery(
  workerId: string,
): Promise<ClaimedNotificationDelivery | null> {
  const claimed = await prisma.$queryRaw<ClaimedNotificationDelivery[]>(Prisma.sql`
    UPDATE notification_deliveries delivery
    SET status = 'PROCESSING',
        attempts = delivery.attempts + 1,
        locked_at = NOW(),
        locked_by = ${workerId},
        updated_at = NOW()
    WHERE delivery.id = (
      SELECT id
      FROM notification_deliveries
      WHERE (
        status IN ('PENDING', 'RETRY_WAIT')
        OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
      )
        AND available_at <= NOW()
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
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

export async function markNotificationDeliverySuppressed(
  deliveryId: string,
  workerId: string,
  reason: string,
): Promise<boolean> {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_deliveries
    SET status = 'SUPPRESSED',
        last_error = ${reason},
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
