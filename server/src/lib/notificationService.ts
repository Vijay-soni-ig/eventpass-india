import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { enqueueNotificationIntent } from "./notificationOutboxService";

type PreferenceField = "eventPublished" | "eventUpdated" | "eventDateChanged" | "ticketsAvailable" | "organizerProfileUpdated";

type FollowerNotificationType =
  | "EVENT_PUBLISHED"
  | "EVENT_UPDATED"
  | "EVENT_DATE_CHANGED"
  | "EVENT_TICKETS_AVAILABLE"
  | "ORGANIZER_PROFILE_UPDATED";

const PREFERENCE_FIELD: Record<FollowerNotificationType, PreferenceField> = {
  EVENT_PUBLISHED: "eventPublished",
  EVENT_UPDATED: "eventUpdated",
  EVENT_DATE_CHANGED: "eventDateChanged",
  EVENT_TICKETS_AVAILABLE: "ticketsAvailable",
  ORGANIZER_PROFILE_UPDATED: "organizerProfileUpdated",
};

async function getEligibleFollowerUserIds(organizerId: string, type: FollowerNotificationType): Promise<string[]> {
  const follows = await prisma.organizerFollow.findMany({
    where: { organizerId, user: { suspended: false } },
    select: { userId: true },
  });
  if (follows.length === 0) return [];

  const userIds = follows.map((f) => f.userId);
  const field = PREFERENCE_FIELD[type];
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      eventPublished: true,
      eventUpdated: true,
      eventDateChanged: true,
      ticketsAvailable: true,
      organizerProfileUpdated: true,
    },
  });
  const optedOut = new Set(prefs.filter((p) => p[field] === false).map((p) => p.userId));
  return userIds.filter((id) => !optedOut.has(id));
}

async function recentlyGenerated(entityId: string, type: FollowerNotificationType): Promise<boolean> {
  const recent = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM notification_intents
    WHERE entity_id = ${entityId}
      AND event_type = ${type}
      AND created_at > NOW() - INTERVAL '60 seconds'
    LIMIT 1
  `);
  return recent.length > 0;
}

interface GenerateParams {
  organizerId: string;
  type: FollowerNotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
  sourceVersion: string;
}

/**
 * Generates a durable follower notification intent. Recipient resolution and
 * channel preference evaluation are repeated by the dispatcher at delivery
 * time so changes made after enqueue remain authoritative.
 */
export async function generateFollowerNotifications(
  params: GenerateParams,
): Promise<{ created: number; skipped: "debounced" | "no-followers" | undefined }> {
  try {
    if (await recentlyGenerated(params.entityId, params.type)) {
      return { created: 0, skipped: "debounced" };
    }

    const recipientIds = await getEligibleFollowerUserIds(params.organizerId, params.type);
    if (recipientIds.length === 0) return { created: 0, skipped: "no-followers" };

    const idempotencyKey = `follower:${params.type}:${params.entityId}:${params.sourceVersion}`;
    const result = await enqueueNotificationIntent({
      eventKey: idempotencyKey,
      idempotencyKey,
      eventType: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: {
        organizerId: params.organizerId,
        eventType: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
      },
    });

    if (result.created) {
      await logAudit({
        actorUserId: null,
        action: "notification.intent_enqueued",
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: {
          type: params.type,
          recipientCountAtEnqueue: recipientIds.length,
          idempotencyKey,
        },
      });
    }

    return { created: result.created ? recipientIds.length : 0, skipped: undefined };
  } catch (err) {
    await logAudit({
      actorUserId: null,
      action: "notification.generation_failed",
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: {
        type: params.type,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { created: 0, skipped: undefined };
  }
}
