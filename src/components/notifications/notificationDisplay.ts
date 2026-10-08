import { Calendar, CalendarClock, Ticket, Sparkles, Building2, Store, ClipboardList, UserRound, Presentation, Handshake, Store as VendorIcon, type LucideIcon } from "lucide-react";
import type { NotificationType } from "@/types/notification";

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  EVENT_PUBLISHED: Sparkles, EVENT_UPDATED: Calendar, EVENT_DATE_CHANGED: CalendarClock, EVENT_TICKETS_AVAILABLE: Ticket, ORGANIZER_PROFILE_UPDATED: Building2,
  STALL_RESERVATION_EXPIRED: Store, REGISTRATION_SUBMITTED: ClipboardList, REGISTRATION_CONFIRMED: ClipboardList, REGISTRATION_CANCELLED: ClipboardList,
  PARTICIPANT_CREATED: UserRound, PARTICIPANT_UPDATED: UserRound, PARTICIPANT_SESSION_ASSIGNED: Presentation, PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED: Handshake, PARTICIPANT_VENDOR_SERVICE_ASSIGNED: VendorIcon,
};
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  EVENT_PUBLISHED: "New event", EVENT_UPDATED: "Event updated", EVENT_DATE_CHANGED: "Date changed", EVENT_TICKETS_AVAILABLE: "Tickets available", ORGANIZER_PROFILE_UPDATED: "Organizer update",
  STALL_RESERVATION_EXPIRED: "Reservation expired", REGISTRATION_SUBMITTED: "Registration submitted", REGISTRATION_CONFIRMED: "Registration confirmed", REGISTRATION_CANCELLED: "Registration cancelled",
  PARTICIPANT_CREATED: "Participant added", PARTICIPANT_UPDATED: "Participant updated", PARTICIPANT_SESSION_ASSIGNED: "Session assignment", PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED: "Sponsor package assignment", PARTICIPANT_VENDOR_SERVICE_ASSIGNED: "Vendor service assignment",
};
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime(); const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m`; const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`; const days = Math.floor(hours / 24); if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}