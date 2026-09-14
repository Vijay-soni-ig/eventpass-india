import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logAudit } from './audit';

/** Provider-neutral channels supported by the notification foundation. */
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
  actorUserId?: string | null;
}

export interface EnqueueNotificationIntentResult {
  id: string;
  created: boolean;
}

/**
 * Inserts a durable notification intent.
 *
 * The unique idempotency key is the authoritative retry/concurrency guard.
 * A read-before-write check is deliberately not used as the primary guard.
 * Raw SQL is used until Prisma models for the foundation tables are
 * synchronized and the generated client is refreshed.
 */
export async function enqueueNotificationIntent(
  input: EnqueueNotificationIntentInput,
): Promise<EnqueueNotificationIntentResult> {
  const availableAt = input.availableAt ?? new Date();

  const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO notification_intents (
      event_key, idempotency_key, event_type, entity_type, entity_id,
      payload, status, available_at
    )
    VALUES (
      ${input.eventKey}, ${input.idempotencyKey}, ${input.eventType},
      ${input.entityType}, ${input.entityId}, ${JSON.stringify(input.payload)}::jsonb,
      'PENDING', ${availableAt}
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `);

  if (inserted.length > 0) {
    return { id: inserted[0].id, created: true };
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM notification_intents
    WHERE idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);

  if (existing.length === 0) {
    throw new Error('Notification intent was not inserted and could not be recovered by idempotency key');
  }

  await logAudit({
    actorUserId: input.actorUserId ?? null,
    action: 'notification.intent_duplicate',
    entityType: 'NotificationIntent',
    entityId: existing[0].id,
    metadata: { idempotencyKey: input.idempotencyKey, eventType: input.eventType },
  });

  return { id: existing[0].id, created: false };
}

export interface ClaimedNotificationIntent {
  id: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  attempts: number;
}

/**
 * Claims one available intent with a five-minute lease.
 *
 * Phase 31 (FP-06): this function had zero callers before the dispatcher —
 * extended here (entityType/entityId/attempts added to the return shape) for
 * its first real consumer, notificationDispatcher.ts, which needs entityId to
 * resolve a recipient and attempts to compute retry backoff.
 *
 * Also fixed here (found via the dispatcher's own concurrency tests): the
 * final UPDATE previously matched only `intent.id = candidate.id`, never
 * re-checking status/lock. Under READ COMMITTED, two concurrent callers'
 * candidate CTEs can both select the SAME row (the CTE's SELECT takes no row
 * lock), and both UPDATEs then matched by id alone — the second writer's
 * UPDATE ran after the first committed and still matched by id, incrementing
 * attempts a second time and reporting success to both callers. The WHERE
 * clause now repeats the CTE's eligibility check, so whichever UPDATE
 * commits second finds nothing left to match and correctly returns no row.
 *
 * Also fixed here (found via the dispatcher's own restart-recovery test):
 * the candidate CTE's status filter was `IN ('PENDING', 'RETRY_WAIT')` only
 * — a row stuck in PROCESSING (a worker claimed it, then crashed before
 * calling any mark-* function) can NEVER match that filter regardless of how
 * stale its lock is, since PROCESSING isn't in the list at all. The
 * `locked_at`/`locked_by` staleness check existed for exactly this recovery
 * case but was unreachable dead logic. Now a PROCESSING row past the
 * 5-minute lease is also eligible.
 *
 * Rewritten from a "candidate CTE joined into an UPDATE" shape to
 * `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)`: the CTE-join
 * version was empirically double-claiming the same row under real
 * concurrency (confirmed via this file's own dispatcher tests, reproducible
 * every time once the connection pool had more than one active connection)
 * despite re-checking status/lock in the final UPDATE's WHERE clause —
 * Postgres's EvalPlanQual re-check on a lock conflict does not reliably
 * reapply a condition sourced from a joined CTE the way it does for a plain
 * WHERE clause on the target table. `FOR UPDATE SKIP LOCKED` is the
 * standard, well-established Postgres recipe for a "claim one row from a
 * queue" operation specifically because it takes the row lock during the
 * SELECT itself — a second concurrent SELECT skips a row already locked by
 * another transaction instead of also selecting it, so there is no
 * lock-then-recheck ambiguity to reason about at all.
 *
 * One more real bug found in the course of debugging the above: this
 * table's timestamp columns were originally plain TIMESTAMP (no time zone).
 * On a Postgres session not configured for UTC (e.g. a local dev database),
 * `locked_at < NOW() - INTERVAL '5 minutes'` is wrong even for a
 * correctly-stored value, because NOW()'s implicit cast to TIMESTAMP for the
 * comparison ALSO applies the session's time zone — a brand-new,
 * zero-millisecond-old lock could register as "already more than 5 minutes
 * stale," letting a second claim immediately reclaim a row another worker
 * had just claimed (this reproduced deterministically, not as a rare race).
 * Fixed at the schema level (migration 20260915100000) by changing every
 * timestamp column on this table and notification_deliveries to
 * TIMESTAMPTZ, which always represents an absolute instant regardless of
 * session time zone — binding a plain JS Date, as done here, is correct and
 * unambiguous against a TIMESTAMPTZ column.
 */
export async function claimNotificationIntent(workerId: string): Promise<ClaimedNotificationIntent | null> {
  const leaseTime = new Date();
  const claimed = await prisma.$queryRaw<
    Array<{ id: string; event_type: string; entity_type: string | null; entity_id: string | null; payload: unknown; attempts: number }>
  >(Prisma.sql`
    UPDATE notification_intents intent
    SET status = 'PROCESSING', attempts = intent.attempts + 1,
        locked_at = ${leaseTime}, locked_by = ${workerId}, updated_at = NOW()
    WHERE intent.id = (
      SELECT id
      FROM notification_intents
      WHERE (
        status IN ('PENDING', 'RETRY_WAIT')
        OR (status = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
      )
        AND available_at <= NOW()
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING intent.id, intent.event_type, intent.entity_type, intent.entity_id, intent.payload, intent.attempts
  `);

  const row = claimed[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
    attempts: row.attempts,
  };
}

/** Marks an intent COMPLETED — every applicable recipient/channel got a delivery decision (not necessarily a successful send; per-delivery outcomes are tracked separately). */
export async function markNotificationIntentCompleted(intentId: string, workerId: string): Promise<boolean> {
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_intents
    SET status = 'COMPLETED', completed_at = NOW(), locked_at = NULL, locked_by = NULL, updated_at = NOW()
    WHERE id = ${intentId} AND status = 'PROCESSING' AND locked_by = ${workerId}
  `);
  return result === 1;
}

/** Schedules a retry for an intent that failed to resolve/fan-out (e.g. a transient DB error), or permanently dead-letters it once retries are exhausted. */
export async function markNotificationIntentRetryOrDead(
  intentId: string,
  workerId: string,
  errorMessage: string,
  outcome: 'retry' | 'dead_letter',
  retryAt?: Date,
): Promise<boolean> {
  if (outcome === 'dead_letter') {
    const result = await prisma.$executeRaw(Prisma.sql`
      UPDATE notification_intents
      SET status = 'DEAD_LETTER', last_error = ${errorMessage}, locked_at = NULL, locked_by = NULL, updated_at = NOW()
      WHERE id = ${intentId} AND status = 'PROCESSING' AND locked_by = ${workerId}
    `);
    return result === 1;
  }
  const result = await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_intents
    SET status = 'RETRY_WAIT', available_at = ${retryAt ?? new Date()}, last_error = ${errorMessage},
        locked_at = NULL, locked_by = NULL, updated_at = NOW()
    WHERE id = ${intentId} AND status = 'PROCESSING' AND locked_by = ${workerId}
  `);
  return result === 1;
}
