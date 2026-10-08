import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface WhatsAppCampaign {
  id: string;
  organizerId: string;
  eventId: string;
  eventTitle: string;
  name: string;
  message: string;
  audience: "CONFIRMED_REGISTRATIONS" | "TICKET_HOLDERS";
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "COMPLETED" | "CANCELLED" | "QUEUED";
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  recipientCount: number;
  pendingCount: number;
}

const KEY = ["organizer-whatsapp-campaigns"];

export function useWhatsAppCampaigns(eventId?: string) {
  return useQuery({
    queryKey: [...KEY, eventId ?? "all"],
    queryFn: () => api.get<{ campaigns: WhatsAppCampaign[]; total: number }>(
      eventId ? `/api/organizer/whatsapp-campaigns?eventId=${encodeURIComponent(eventId)}` : "/api/organizer/whatsapp-campaigns",
    ),
  });
}

export function useCreateWhatsAppCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { eventId: string; name: string; message: string; audience: WhatsAppCampaign["audience"] }) =>
      api.post<{ campaign: WhatsAppCampaign }>("/api/organizer/whatsapp-campaigns", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendWhatsAppCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ campaignId: string; queuedRecipients: number }>(`/api/organizer/whatsapp-campaigns/${id}/send`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelWhatsAppCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ cancelled: boolean }>(`/api/organizer/whatsapp-campaigns/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
