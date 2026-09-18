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
 * Defense-in-depth for notification action URLs. Every current call site
 * (notificationService.ts, notificationEventRegistry.ts's stall-expiry
 * template) already only ever builds these from validated/internal values
 * (a UUID entity id, or a slug already constrained to
 * `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` — see organizerProfile.ts's slugSchema), so
 * no known path can currently deliver an unsafe URL. This still guards the
 * shared template layer itself so a future or mistaken caller can never
 * smuggle an open-redirect ("//evil.example.com", "https://evil.example.com")
 * or a script-executing scheme ("javascript:", "data:", "vbscript:") into a
 * rendered notification's action link: only an internal, root-relative path
 * is accepted, otherwise the caller's fallback is used instead.
 */
/** True if `value` contains any ASCII control character (code points 0x00-0x1f). Written as a
 * charCode scan rather than a `[\x00-\x1f]` regex class so the check doesn't trip the
 * `no-control-regex` lint rule while still rejecting the same inputs. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) <= 0x1f) {
      return true;
    }
  }
  return false;
}

function safeActionUrl(candidate: string, fallback: string): string {
  if (
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !/^\/\\/i.test(candidate) &&
    !hasControlCharacter(candidate)
  ) {
    return candidate;
  }
  return fallback;
}

function renderFollowerTemplate(payload: Record<string, unknown>, fallbackTitle: string, fallbackBody: string, fallbackActionUrl = "/notifications") {
  return {
    title: stringValue(payload, "title", fallbackTitle),
    body: stringValue(payload, "message", fallbackBody),
    actionUrl: safeActionUrl(stringValue(payload, "actionUrl", fallbackActionUrl), fallbackActionUrl),
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
