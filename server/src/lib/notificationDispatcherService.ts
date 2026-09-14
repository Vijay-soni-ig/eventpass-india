import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { claimNotificationIntent } from './notificationOutboxService';

export type DispatchableChannel = 'IN_APP' | 'EMAIL' | 'PUSH';

export interface NotificationIntentPayload {
  recipientUserIds?: string[];
  channels?: DispatchableChannel[];
  templateKey?: string;
  [key: string]: unknown;
}

export interface DispatchResult {
  intentId: string;
  recipientCount: number;
  deliveryCount: number;
  suppressedCount: number;
}

const DEFAULT_CHANNELS: DispatchableChannel[] = ['IN_APP'];

function parsePayload(payload: unknown): NotificationIntentPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as NotificationIntentPayload;
}

/**
 * Resolves recipients and creates one delivery per recipient/channel.
 * The unique database constraint makes repeated dispatches safe.
 *
 * The initial contract expects event producers to include recipientUserIds in
 * the intent payload. Domain-specific recipient resolution can be layered on
 * later without changing delivery persistence or worker behavior.
 */
export async function dispatchClaimedNotificationIntent(
  intent: { id: string; eventType: string; payload: unknown },
): Promise<DispatchResult> {
  const payload = parsePayload(intent.payload);
  const recipientUserIds = [...new Set((payload.recipientUserIds ?? []).filter(Boolean))];
  const channels = payload.channels?.length ? payload.channels : DEFAULT_CHANNELS;
  const templateKey = typeof payload.templateKey === 'string' ? payload.templateKey : null;

  if (recipientUserIds.length === 0) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE notification_intents
      SET status = 'COMPLETED', completed_at = NOW(), locked_at = NULL,
          locked_by = NULL, updated_at = NOW()
      WHERE id = ${intent.id} AND status = 'PROCESSING'
    `);
    return { intentId: intent.id, recipientCount: 0, deliveryCount: 0, suppressedCount: 0 };
  }

  let deliveryCount = 0;
  let suppressedCount = 0;

  for (const recipientUserId of recipientUserIds) {
    for (const channel of channels) {
      const preference = await prisma.$queryRaw<Array<{ enabled: boolean }>>(Prisma.sql`
        SELECT enabled
        FROM notification_channel_preferences
        WHERE user_id = ${recipientUserId}
          AND event_type = ${intent.eventType}
          AND channel = ${channel}
        LIMIT 1
      `);

      if (preference[0]?.enabled === false) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO notification_deliveries
            (intent_id, recipient_user_id, channel, status, template_key, rendered_payload)
          VALUES
            (${intent.id}, ${recipientUserId}, ${channel}, 'SUPPRESSED', ${templateKey}, ${JSON.stringify(payload)}::jsonb)
          ON CONFLICT (intent_id, recipient_user_id, channel) DO NOTHING
        `);
        suppressedCount += 1;
        continue;
      }

      const inserted = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO notification_deliveries
          (intent_id, recipient_user_id, channel, status, template_key, rendered_payload)
        VALUES
          (${intent.id}, ${recipientUserId}, ${channel}, 'PENDING', ${templateKey}, ${JSON.stringify(payload)}::jsonb)
        ON CONFLICT (intent_id, recipient_user_id, channel) DO NOTHING
      `);
      deliveryCount += inserted;
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE notification_intents
    SET status = 'COMPLETED', completed_at = NOW(), locked_at = NULL,
        locked_by = NULL, updated_at = NOW()
    WHERE id = ${intent.id} AND status = 'PROCESSING'
  `);

  return { intentId: intent.id, recipientCount: recipientUserIds.length, deliveryCount, suppressedCount };
}

/** Claims and dispatches one intent. */
export async function processOneNotificationIntent(workerId: string): Promise<DispatchResult | null> {
  const intent = await claimNotificationIntent(workerId);
  if (!intent) return null;
  return dispatchClaimedNotificationIntent(intent);
}
