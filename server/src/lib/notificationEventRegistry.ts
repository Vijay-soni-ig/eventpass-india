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

/**
 * Central event registry. Domain-specific recipient resolution lives here;
 * the dispatcher remains responsible only for queueing, preference checks,
 * delivery, retry and failure handling.
 */
export const NOTIFICATION_EVENTS: Record<string, NotificationEventDefinition> = {
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
