export type NotificationType =
  | "EVENT_PUBLISHED"
  | "EVENT_UPDATED"
  | "EVENT_DATE_CHANGED"
  | "EVENT_TICKETS_AVAILABLE"
  | "ORGANIZER_PROFILE_UPDATED";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
  organizerId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  eventPublished: boolean;
  eventUpdated: boolean;
  eventDateChanged: boolean;
  ticketsAvailable: boolean;
  organizerProfileUpdated: boolean;
}
