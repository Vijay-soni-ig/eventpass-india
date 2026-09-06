import { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

type PreferenceField = "eventPublished" | "eventUpdated" | "eventDateChanged" | "ticketsAvailable" | "organizerProfileUpdated";

// Phase 22.3 — follower-engagement notifications.
//
// ARCHITECTURE DECISION (documented per the phase brief's requirement):
// no queue/outbox/background-job infrastructure exists anywhere in this
// project (confirmed by inspection — no bull/redis/cron dependency). This
// service therefore runs synchronously, AFTER the triggering business
// transaction has already committed, using a bulk `createMany` insert (not
// a per-follower loop) so a large follower list is one round trip, not N.
// A notification-generation failure is caught and audited but never thrown
// back to the caller — the business action (publishing an event, updating
// an organizer profile) has already succeeded and must not be undone or
// reported as failed because of a downstream engagement side-effect. This
// mirrors the existing project convention in lib/organizer.ts, where
// logAudit() is likewise called only after a transaction commits and never
// allowed to fail the request.
//
// Documented as future work (not built here, per the phase brief's explicit
// "do not build" list): email/SMS/push delivery, a message queue, gallery
// update notifications, notification retention/deletion job.

const PREFERENCE_FIELD: Record<NotificationType, PreferenceField> = {
  EVENT_PUBLISHED: "eventPublished",
  EVENT_UPDATED: "eventUpdated",
  EVENT_DATE_CHANGED: "eventDateChanged",
  EVENT_TICKETS_AVAILABLE: "ticketsAvailable",
  ORGANIZER_PROFILE_UPDATED: "organizerProfileUpdated",
};

/**
 * Followers eligible for a given notification type: must have an active
 * follow relationship, a non-suspended account, and must not have
 * explicitly opted out of this notification type. A user with no
 * preference row yet is opted IN by default (see the model's own doc
 * comment) — the row is created lazily on first read/update of
 * preferences, not on follow.
 */
async function getEligibleFollowerUserIds(organizerId: string, type: NotificationType): Promise<string[]> {
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

/**
 * Debounce window against a single organizer/entity repeatedly re-triggering
 * the same notification type in rapid succession (e.g. an organizer
 * flip-flopping a field back and forth). This is the "generation volume
 * protection" called for in the phase brief — exhibitions.ts/organizerProfile.ts
 * have no rate-limit middleware of their own to reuse for this specific
 * concern (unlike the mutation endpoints below, which reuse Phase 22.1's
 * rate limiters directly), so this narrow, self-contained check stands in
 * for one rather than retrofitting a new limiter onto unrelated routes.
 */
const GENERATION_DEBOUNCE_MS = 60_000;

async function recentlyGenerated(entityId: string, type: NotificationType): Promise<boolean> {
  const recent = await prisma.notification.findFirst({
    where: { entityId, type, createdAt: { gt: new Date(Date.now() - GENERATION_DEBOUNCE_MS) } },
    select: { id: true },
  });
  return !!recent;
}

interface GenerateParams {
  organizerId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
  sourceVersion: string;
}

/**
 * Creates one Notification per eligible follower via a single bulk insert.
 * Idempotent under retries/concurrency purely through the DB's own
 * @@unique([userId, entityId, type, sourceVersion]) constraint +
 * skipDuplicates — no application-level lock is needed: two concurrent
 * calls for the identical (organizerId, entityId, type, sourceVersion)
 * racing each other simply both attempt the same insert set, and Postgres
 * lets only the first survive per row.
 */
export async function generateFollowerNotifications(params: GenerateParams): Promise<{ created: number; skipped: "debounced" | "no-followers" | undefined }> {
  try {
    if (await recentlyGenerated(params.entityId, params.type)) {
      return { created: 0, skipped: "debounced" };
    }

    const recipientIds = await getEligibleFollowerUserIds(params.organizerId, params.type);
    if (recipientIds.length === 0) return { created: 0, skipped: "no-followers" };

    const result = await prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType,
        entityId: params.entityId,
        actionUrl: params.actionUrl,
        organizerId: params.organizerId,
        sourceVersion: params.sourceVersion,
      })),
      skipDuplicates: true,
    });

    if (result.count > 0) {
      await logAudit({
        actorUserId: null,
        action: "notification.bulk_generated",
        entityType: "Organizer",
        entityId: params.organizerId,
        metadata: { type: params.type, entityId: params.entityId, recipientCount: result.count },
      });
    }
    return { created: result.count, skipped: undefined };
  } catch (err) {
    // A notification-generation failure must never surface as a failure of
    // the business action that triggered it (publishing an event, saving a
    // profile edit) — caught here, never rethrown.
    await logAudit({
      actorUserId: null,
      action: "notification.generation_failed",
      entityType: "Organizer",
      entityId: params.organizerId,
      metadata: { type: params.type, entityId: params.entityId, error: err instanceof Error ? err.message : String(err) },
    });
    return { created: 0, skipped: undefined };
  }
}
