import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface UniversalCheckInTicket {
  id: string;
  eventId: string;
  ticketCode: string;
  attendeeName: string;
  attendeeEmail: string;
  status: string;
  checkedInAt: string | null;
}

export interface UniversalCheckInResponse {
  success: true;
  ticket: UniversalCheckInTicket;
  checkIn: { id: string; eventTicketId: string; eventId: string; method: string; scannedAt: string };
}

export function useUniversalEventTicketCheckIn() {
  return useMutation({
    mutationFn: ({ qrPayload, eventId }: { qrPayload: string; eventId?: string }) =>
      api.post<UniversalCheckInResponse>("/api/event-ticket-check-ins", { qrPayload, eventId }),
  });
}


export interface UniversalCheckInSummary {
  event: { id: string; title: string; status: string; archived: boolean };
  counts: {
    total: number;
    active: number;
    used: number;
    cancelled: number;
    refunded: number;
    checkInRate: number;
  };
  recentScans: Array<{
    id: string;
    scannedAt: string;
    method: string;
    eventTicket: {
      ticketCode: string;
      attendeeName: string;
      eventTicketType: { name: string };
    };
  }>;
}

export function useUniversalEventTicketCheckInSummary(eventId: string) {
  return useQuery({
    queryKey: ["universal-event-ticket-check-in-summary", eventId],
    queryFn: () => api.get<UniversalCheckInSummary>(`/api/event-ticket-check-ins/summary?eventId=${encodeURIComponent(eventId)}`),
    enabled: Boolean(eventId),
    refetchInterval: 5000,
  });
}
