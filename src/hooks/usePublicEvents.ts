import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { UniversalEventDetail, UniversalEventListResponse, UniversalEventParticipant } from "@/types/event";

export interface PublicEventCategory { id: string; name: string; slug: string; description: string | null; parentCategoryId: string | null; }

export interface PublicEventParams {
  q?: string; eventType?: string; categoryId?: string; city?: string; dateFrom?: string; dateTo?: string;
  sort?: "soonest" | "newest" | "title"; page?: number; limit?: number;
}
export interface PublicEventTicketType {
  id: string; name: string; description: string | null; price: number | string; currency: string;
  capacity: number; maxPerOrder: number; maxPerAttendee: number; saleStartsAt: string | null;
  saleEndsAt: string | null; sortOrder: number; remaining: number; soldOut: boolean;
}
export interface PublicEventTicketsResponse {
  event: Pick<UniversalEventDetail, "id" | "title" | "startDate" | "endDate" | "timezone" | "venue" | "city" | "coverImageUrl">;
  ticketTypes: PublicEventTicketType[];
}
function queryString(params: PublicEventParams) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") q.set(key, String(value)); });
  return q.toString();
}
export function usePublicEventCategories() {
  return useQuery({
    queryKey: ["public-event-categories"],
    queryFn: () => api.get<{ categories: PublicEventCategory[] }>("/api/public/event-categories"),
    staleTime: 5 * 60 * 1000,
  });
}
export function usePublicEvents(params: PublicEventParams = {}) {
  return useQuery({
    queryKey: ["public-events", params],
    queryFn: () => api.get<UniversalEventListResponse>(`/api/public/events?${queryString(params)}`),
    retry: 1,
  });
}
export function usePublicEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["public-event", id],
    queryFn: () => api.get<{ event: UniversalEventDetail; linkedExhibitionId: string | null }>(`/api/public/events/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}
export function usePublicEventTickets(id: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ["public-event-tickets", id],
    queryFn: () => api.get<PublicEventTicketsResponse>(`/api/public/events/${id}/tickets`),
    enabled: Boolean(id) && enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
export function usePublicEventParticipants(id: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ["public-event-participants", id],
    queryFn: () => api.get<{ participants: UniversalEventParticipant[] }>(`/api/public/events/${id}/participants`),
    enabled: Boolean(id) && enabled,
    retry: 1,
  });
}

export interface PublicParticipantProfileResponse {
  event: {
    id: string; title: string; startDate: string | null; endDate: string | null;
    timezone: string; venue: string | null; city: string | null;
    organizer: { name: string; slug: string | null };
  };
  participant: {
    id: string; participantType: string; customType: string | null; name: string;
    title: string | null; organization: string | null; bio: string | null;
    website: string | null; photoUrl: string | null; sortOrder: number;
    sponsorProfile: {
      logoUrl: string | null; brandPrimaryColor: string | null; brandSecondaryColor: string | null;
      displayWebsite: string | null; benefitsOverride: string[] | null; deliverablesOverride: string[] | null;
      package: { name: string; description: string | null; benefits: string[]; deliverables: string[]; status: "ACTIVE" | "INACTIVE" | "ARCHIVED" } | null;
    } | null;
    vendorProfile: {
      serviceArea: string | null; operatingHours: string | null; displayWebsite: string | null;
      services: Array<{ name: string; description: string | null; category: string | null }>;
    } | null;
  };
  media: Array<{
    id: string; kind: "PROFILE_IMAGE" | "LOGO" | "GALLERY"; fileUrl: string;
    altText: string | null; caption: string | null; sortOrder: number;
  }>;
}

export function usePublicParticipantProfile(eventId: string | undefined, participantId: string | undefined) {
  return useQuery({
    queryKey: ["public-participant-profile", eventId, participantId],
    queryFn: () => api.get<PublicParticipantProfileResponse>(`/api/public/events/${eventId}/participants/${participantId}/profile`),
    enabled: Boolean(eventId) && Boolean(participantId),
    retry: false,
  });
}

export interface PublicParticipantSession {
  id: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  room: string | null;
  speakers: Array<{
    role: "PRIMARY" | "MODERATOR" | "PANELIST";
    participant: { id: string; name: string; title: string | null; organization: string | null; photoUrl: string | null };
  }>;
}

export function usePublicParticipantSessions(eventId: string | undefined, participantId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["public-participant-sessions", eventId, participantId],
    queryFn: () => api.get<{ sessions: PublicParticipantSession[] }>(`/api/public/events/${eventId}/participants/${participantId}/sessions`),
    enabled: Boolean(eventId) && Boolean(participantId) && enabled,
    retry: 1,
    staleTime: 30 * 1000,
  });
}
