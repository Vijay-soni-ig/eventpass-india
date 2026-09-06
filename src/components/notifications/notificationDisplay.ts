import { Calendar, CalendarClock, Ticket, Sparkles, Building2, type LucideIcon } from "lucide-react";
import type { NotificationType } from "@/types/notification";

// Shared between the header bell popover and the full notifications page —
// icon plus a screen-reader-friendly type label (spec 40: unread state and
// meaning must not depend on color/icon alone).
export const NOTIFICATION_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  EVENT_PUBLISHED: Sparkles,
  EVENT_UPDATED: Calendar,
  EVENT_DATE_CHANGED: CalendarClock,
  EVENT_TICKETS_AVAILABLE: Ticket,
  ORGANIZER_PROFILE_UPDATED: Building2,
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  EVENT_PUBLISHED: "New event",
  EVENT_UPDATED: "Event updated",
  EVENT_DATE_CHANGED: "Date changed",
  EVENT_TICKETS_AVAILABLE: "Tickets available",
  ORGANIZER_PROFILE_UPDATED: "Organizer update",
};

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
