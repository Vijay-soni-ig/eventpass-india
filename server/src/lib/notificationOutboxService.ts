import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logAudit } from './audit';

/**
 * Provider-neutral notification channels supported by the foundation.
 * Keep this list aligned with the notification migration and worker contract.
 */
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationIntentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'RETRY_WAIT'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export interface EnqueueNotificationIntentInput {
  eventKey: string;
  idempotencyKey: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
}

export interface EnqueueNotificationIntentResult {
  id: string;
  created: boolean;
}

/**
 * Inserts a durable notification intent.
 *
 * The unique idempotency key is the authoritative retry/concurrency guard;
 * callers must not use a read-before-write check as their only protection.
 * This service intentionally uses parameterized SQL until Prisma models for
 * the new foundation tables are generated from the synchronized schema.
 */
export async function enqueueNotificationIntent(
  input: EnqueueNotificationIntentInput,
): Promise<EnqueueNotificationIntentResult> {
  const availableAt = input.availableAt ?? new Date();

  const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO notification_intents (
      event_key,
      idempotency_key,
      event_type,
      entity_type,
      entity_id,
      payload,
      status,
      available_at
    )
    VALUES (
      ${input.eventKey},
      ${input.idempotencyKey},
      ${input.eventType},
      ${input.entityType},
      ${input.entityId},
      ${JSON.stringify(input.payload)}::jsonb,
      'PENDING',
      ${availableAt}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `);

  if (inserted.length > 0) {
    return { id: inserted[0].id, created: true };
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM notification_intents
    WHERE idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);

  if (existing.length === 0) {
    throw new Error('Notification intent was not inserted and could not be recovered by idempotency key');
  }

  await logAudit({
    action: 'notification.intent_duplicate',
    entityType: 'NotificationIntent',
    entityId: existing[0].id,
    metadata: { idempotencyKey: input.idempotencyKey, eventType: input.eventType },
  });

  return { id: existing[0].id, created: false };
}

/**
 * Claims one available intent using a lease. The conditional update prevents
 * two workers from claiming the same row without requiring an application
 * level lock. A later worker implementation should use SKIP LOCKED batching
 * for higher throughput.
 */
export async function claimNotificationIntent(workerId: string): Promise<{
  id: string;
  eventType: string;
  payload: unknown;
} | null> {
  const leaseTime = new Date();
  const claimed = await prisma.$queryRaw<Array<{ id: string; event_type: string; payload: unknown }>>(Prisma.sql`
    WITH candidate AS (
      SELECT id
      FROM notification_intents
      WHERE status IN ('PENDING', 'RETRY_WAIT')
        AND available_at <= NOW()
        AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '5 minutes')
      ORDER BY created_at ASC
      LIMIT 1
    )
    UPDATE notification_intents intent
    SET status = 'PROCESSING',
        attempts = intent.attempts + 1,
        locked_at = ${leaseTime},
        locked_by = ${workerId},
        updated_at = NOW()
    FROM candidate
    WHERE intent.id = candidate.id
    RETURNING intent.id, intent.event_type, intent.payload
  `);

  return claimed[0] ?? null;
}
