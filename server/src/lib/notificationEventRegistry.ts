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

type FollowerNotificationType =
  | "EVENT_PUBLISHED"
  | "EVENT_UPDATED"
  | "EVENT_DATE_CHANGED"
  | "EVENT_TICKETS_AVAILABLE"
  | "ORGANIZER_PROFILE_UPDATED";

type PreferenceField = "eventPublished" | "eventUpdated" | "eventDateChanged" | "ticketsAvailable" | "organizerProfileUpdated";

async function resolveEventParticipantRecipients(
  _payload: Record<string, unknown>,
  eventId: string,
): Promise<ResolvedNotificationRecipient[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizer: { select: { ownerId: true } } },
  });
  const ownerId = event?.organizer?.ownerId;
  if (!ownerId) return [];
  const user = await prisma.user.findFirst({ where: { id: ownerId, suspended: false }, select: { id: true } });
  return user ? [{ userId: user.id, channels: ["IN_APP", "EMAIL", "PUSH"] }] : [];
}

const FOLLOWER_PREFERENCE_FIELD: Record<FollowerNotificationType, PreferenceField> = {
  EVENT_PUBLISHED: "eventPublished",
  EVENT_UPDATED: "eventUpdated",
  EVENT_DATE_CHANGED: "eventDateChanged",
  EVENT_TICKETS_AVAILABLE: "ticketsAvailable",
  ORGANIZER_PROFILE_UPDATED: "organizerProfileUpdated",
};

async function resolveFollowerRecipients(
  payload: Record<string, unknown>,
  _entityId: string,
): Promise<ResolvedNotificationRecipient[]> {
  const organizerId = typeof payload.organizerId === "string" ? payload.organizerId : null;
  const eventType = typeof payload.eventType === "string" ? payload.eventType as FollowerNotificationType : null;
  if (!organizerId || !eventType || !(eventType in FOLLOWER_PREFERENCE_FIELD)) return [];

  const follows = await prisma.organizerFollow.findMany({
    where: { organizerId, user: { suspended: false } },
    select: { userId: true },
  });
  if (follows.length === 0) return [];

  const userIds = follows.map(({ userId }) => userId);
  const field = FOLLOWER_PREFERENCE_FIELD[eventType];
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
  const optedOut = new Set(prefs.filter((pref) => pref[field] === false).map((pref) => pref.userId));

  return userIds
    .filter((userId) => !optedOut.has(userId))
    .map((userId) => ({
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

async function resolveRegistrationRecipient(
  payload: Record<string, unknown>,
  _entityId: string,
): Promise<ResolvedNotificationRecipient[]> {
  const userId = typeof payload.userId === "string" ? payload.userId : null;
  if (!userId) return [];
  const user = await prisma.user.findFirst({ where: { id: userId, suspended: false }, select: { id: true } });
  return user ? [{ userId: user.id, channels: ["IN_APP", "EMAIL", "PUSH"] }] : [];
}

/** Central event registry. Recipient resolution is always server-side. */
export const NOTIFICATION_EVENTS: Record<string, NotificationEventDefinition> = {
  EVENT_PUBLISHED: { eventType: "EVENT_PUBLISHED", resolveRecipients: resolveFollowerRecipients },
  EVENT_UPDATED: { eventType: "EVENT_UPDATED", resolveRecipients: resolveFollowerRecipients },
  EVENT_DATE_CHANGED: { eventType: "EVENT_DATE_CHANGED", resolveRecipients: resolveFollowerRecipients },
  EVENT_TICKETS_AVAILABLE: { eventType: "EVENT_TICKETS_AVAILABLE", resolveRecipients: resolveFollowerRecipients },
  ORGANIZER_PROFILE_UPDATED: { eventType: "ORGANIZER_PROFILE_UPDATED", resolveRecipients: resolveFollowerRecipients },
  STALL_RESERVATION_EXPIRED: {
    eventType: "STALL_RESERVATION_EXPIRED",
    resolveRecipients: resolveStallReservationExpired,
  },
  REGISTRATION_SUBMITTED: { eventType: "REGISTRATION_SUBMITTED", resolveRecipients: resolveRegistrationRecipient },
  REGISTRATION_CONFIRMED: { eventType: "REGISTRATION_CONFIRMED", resolveRecipients: resolveRegistrationRecipient },
  REGISTRATION_CANCELLED: { eventType: "REGISTRATION_CANCELLED", resolveRecipients: resolveRegistrationRecipient },
  PARTICIPANT_CREATED: { eventType: "PARTICIPANT_CREATED", resolveRecipients: resolveEventParticipantRecipients },
  PARTICIPANT_UPDATED: { eventType: "PARTICIPANT_UPDATED", resolveRecipients: resolveEventParticipantRecipients },
  PARTICIPANT_SESSION_ASSIGNED: { eventType: "PARTICIPANT_SESSION_ASSIGNED", resolveRecipients: resolveEventParticipantRecipients },
  PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED: { eventType: "PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED", resolveRecipients: resolveEventParticipantRecipients },
  PARTICIPANT_VENDOR_SERVICE_ASSIGNED: { eventType: "PARTICIPANT_VENDOR_SERVICE_ASSIGNED", resolveRecipients: resolveEventParticipantRecipients },
};

export function getNotificationEvent(eventType: string): NotificationEventDefinition | null {
  const definition = NOTIFICATION_EVENTS[eventType];
  if (!definition || !getNotificationTemplate(eventType)) return null;
  return definition;
}
