import { useMutation } from "@tanstack/react-query";
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
