import type { NotificationChannel } from "./notificationOutboxService";

export interface NotificationTemplateContext {
  eventType: string;
  payload: Record<string, unknown>;
  entityId: string;
}

export interface NotificationTemplate {
  key: string;
  version: number;
  channels: NotificationChannel[];
  render: (context: NotificationTemplateContext) => {
    title: string;
    body: string;
    actionUrl: string;
  };
}

function stringValue(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function renderFollowerTemplate(payload: Record<string, unknown>, fallbackTitle: string, fallbackBody: string, fallbackActionUrl = "/notifications") {
  return {
    title: stringValue(payload, "title", fallbackTitle),
    body: stringValue(payload, "message", fallbackBody),
    actionUrl: stringValue(payload, "actionUrl", fallbackActionUrl),
  };
}

/** Central notification-template registry. Templates are versioned independently from delivery providers. */
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  EVENT_PUBLISHED: {
    key: "event-published",
    version: 1,
    channels: ["IN_APP", "EMAIL", "PUSH"],
    render: ({ payload }) => renderFollowerTemplate(payload, "New event published", "A new event from an organizer you follow is now available."),
  },
  EVENT_UPDATED: {
    key: "event-updated",
    version: 1,
    channels: ["IN_APP", "EMAIL", "PUSH"],
    render: ({ payload }) => renderFollowerTemplate(payload, "Event details updated", "An event from an organizer you follow has been updated."),
  },
  EVENT_DATE_CHANGED: {
    key: "event-date-changed",
    version: 1,
    channels: ["IN_APP", "EMAIL", "PUSH"],
    render: ({ payload }) => renderFollowerTemplate(payload, "Event date changed", "An event from an organizer you follow has a new schedule."),
  },
  EVENT_TICKETS_AVAILABLE: {
    key: "event-tickets-available",
    version: 1,
    channels: ["IN_APP", "EMAIL", "PUSH"],
    render: ({ payload }) => renderFollowerTemplate(payload, "Tickets available", "Tickets are now available for an event you follow."),
  },
  ORGANIZER_PROFILE_UPDATED: {
    key: "organizer-profile-updated",
    version: 1,
    channels: ["IN_APP", "EMAIL", "PUSH"],
    render: ({ payload }) => renderFollowerTemplate(payload, "Organizer profile updated", "An organizer you follow has updated their profile.", "/organizers"),
  },
  STALL_RESERVATION_EXPIRED: {
    key: "stall-reservation-expired",
    version: 1,
    channels: ["IN_APP", "EMAIL"],
    render: ({ payload }) => {
      const stallLabel = stringValue(payload, "stallLabel", "your reserved stall");
      return {
        title: "Stall reservation expired",
        body: `Your reservation for ${stallLabel} was released because payment wasn't completed within the reservation window. You can select a stall again from My Participations.`,
        actionUrl: "/exhibitor-dashboard/participations",
      };
    },
  },
};

export function getNotificationTemplate(eventType: string): NotificationTemplate | null {
  return NOTIFICATION_TEMPLATES[eventType] ?? null;
}

export function renderNotificationTemplate(context: NotificationTemplateContext) {
  const template = getNotificationTemplate(context.eventType);
  if (!template) return null;
  return { template, content: template.render(context) };
}
