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

/**
 * Central notification-template registry.
 *
 * Templates are application-owned and versioned independently from delivery
 * providers. Provider credentials are deliberately not part of this layer.
 * Adding a real email/push provider later therefore does not require changing
 * event resolution or template selection.
 */
export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
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
  return {
    template,
    content: template.render(context),
  };
}
