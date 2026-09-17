import { prisma } from "./prisma";
import type { NotificationChannel } from "./notificationOutboxService";
import { getNotificationTemplate } from "./notificationTemplates";

export interface ResolvedNotificationRecipient {
  userId: string;
  channels: NotificationChannel[];
}

export type NotificationRecipientResolver = (
  payload: Record<string, unknown>,
  entityId: string,
) => Promise<ResolvedNotificationRecipient[]>;

export interface NotificationEventDefinition {
  eventType: string;
  resolveRecipients: NotificationRecipientResolver;
}

const FOLLOWER_EVENT_TYPES = new Set([
  "EVENT_PUBLISHED",
  "EVENT_UPDATED",
  "EVENT_DATE_CHANGED",
  "EVENT_TICKETS_AVAILABLE",
  "ORGANIZER_PROFILE_UPDATED",
]);

async function resolveFollowerRecipients(
  payload: Record<string, unknown>,
  _entityId: string,
): Promise<ResolvedNotificationRecipient[]> {
  const organizerId = typeof payload.organizerId === "string" ? payload.organizerId : null;
  if (!organizerId) return [];

  const follows = await prisma.organizerFollow.findMany({
    where: { organizerId, user: { suspended: false } },
    select: { userId: true },
  });

  return follows.map(({ userId }) => ({
    userId,
    channels: ["IN_APP", "EMAIL", "PUSH"] as NotificationChannel[],
  }));
}

async function resolveStallReservationExpired(
  _payload: Record<string, unknown>,
  participationId: string,
): Promise<ResolvedNotificationRecipient[]> {
  const participation = await prisma.exhibitionExhibitor.findUnique({
    where: { id: participationId },
    select: { business: { select: { ownerId: true } } },
  });
  if (!participation?.business?.ownerId) return [];
  return [{ userId: participation.business.ownerId, channels: ["IN_APP", "EMAIL"] }];
}

/** Central event registry. Recipient resolution is always server-side. */
export const NOTIFICATION_EVENTS: Record<string, NotificationEventDefinition> = {
  ...Object.fromEntries(
    [...FOLLOWER_EVENT_TYPES].map((eventType) => [
      eventType,
      { eventType, resolveRecipients: resolveFollowerRecipients },
    ]),
  ),
  STALL_RESERVATION_EXPIRED: {
    eventType: "STALL_RESERVATION_EXPIRED",
    resolveRecipients: resolveStallReservationExpired,
  },
};

export function getNotificationEvent(eventType: string): NotificationEventDefinition | null {
  const definition = NOTIFICATION_EVENTS[eventType];
  if (!definition || !getNotificationTemplate(eventType)) return null;
  return definition;
}
