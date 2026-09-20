import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface LeadCaptureContext {
  participationId: string;
  exhibitorBusinessId: string;
  exhibitionExhibitorId: string;
  exhibitionId: string;
  exhibitionName: string;
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  business: { id: string; companyName: string | null };
  stalls: { id: string; code: string; status: string; exhibitionExhibitorId: string | null }[];
}

export interface ResolvedLeadTicket {
  ticket: {
    id: string;
    status: string;
    attendeeName: string | null;
    attendeeEmail: string | null;
    attendeePhone: string | null;
    ticketCode: string;
  };
  exhibitorBusinessId: string;
  exhibitionExhibitorId: string;
}

export function useLeadCaptureContexts() {
  return useQuery({
    queryKey: ["event-lead-capture-contexts"],
    queryFn: () => api.get<{ contexts: LeadCaptureContext[] }>("/api/event-leads/capture-contexts").then((r) => r.contexts),
  });
}

export function useResolveLeadTicketQr() {
  return useMutation({
    mutationFn: ({ eventId, qrPayload }: { eventId: string; qrPayload: string }) =>
      api.post<ResolvedLeadTicket>("/api/event-leads/capture-contexts/resolve-qr", { eventId, qrPayload }),
  });
}

export function useCaptureLeadFromTicket() {
  return useMutation({
    mutationFn: (data: {
      eventId: string;
      ticketId: string;
      exhibitorBusinessId: string;
      exhibitionExhibitorId: string;
      stallId?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH";
      notes?: string;
    }) => api.post<{ lead?: unknown; leadId?: string; duplicate: boolean }>("/api/event-leads/from-ticket", data),
  });
}
