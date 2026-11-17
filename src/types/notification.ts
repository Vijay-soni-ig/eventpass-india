export type NotificationType =
  | "EVENT_PUBLISHED" | "EVENT_UPDATED" | "EVENT_DATE_CHANGED" | "EVENT_TICKETS_AVAILABLE" | "ORGANIZER_PROFILE_UPDATED"
  | "STALL_RESERVATION_EXPIRED" | "REGISTRATION_SUBMITTED" | "REGISTRATION_CONFIRMED" | "REGISTRATION_CANCELLED"
  | "PARTICIPANT_CREATED" | "PARTICIPANT_UPDATED" | "PARTICIPANT_SESSION_ASSIGNED" | "PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED"
  | "PARTICIPANT_VENDOR_SERVICE_ASSIGNED" | "WHATSAPP_CAMPAIGN"
  | "EXHIBITOR_APPLICATION_SUBMITTED" | "EXHIBITOR_APPLICATION_APPROVED" | "EXHIBITOR_APPLICATION_REJECTED"
  | "STALL_BOOKING_CONFIRMED" | "STALL_PAYMENT_FAILED";

export interface Notification { id: string; userId: string; type: NotificationType; title: string; message: string; entityType: string; entityId: string; actionUrl: string; organizerId: string | null; readAt: string | null; createdAt: string; }
export interface NotificationPreferences { userId: string; eventPublished: boolean; eventUpdated: boolean; eventDateChanged: boolean; ticketsAvailable: boolean; organizerProfileUpdated: boolean; }