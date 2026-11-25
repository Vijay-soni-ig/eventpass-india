import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getActiveExhibitorBusinessId } from "@/lib/apiClient";

export type EventExhibitorStatus = "APPLIED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN";
export interface EventExhibitorParticipation {
  id: string;
  eventId: string;
  exhibitorBusinessId: string;
  status: EventExhibitorStatus;
  applicationNote: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  confirmedAt: string | null;
  withdrawnAt: string | null;
  business?: { id: string; companyName: string | null; kycStatus?: string };
  event?: { id: string; title: string; status: string; visibility: string; startDate: string | null; endDate: string | null; city: string | null; organizer: { id: string; name: string } };
  reviewedByUser?: { id: string; fullName: string | null } | null;
}
const ROOT = "/api/event-exhibitor-participations";
export function useMyEventParticipations() {
  return useQuery({ queryKey: ["event-exhibitor-participations", "mine"], queryFn: () => api.get<{participations: EventExhibitorParticipation[]}>(ROOT + "/mine").then(r => r.participations) });
}
export function useApplyToEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: {eventId: string; applicationNote?: string}) => {
      const businessId = getActiveExhibitorBusinessId();
      return api.post<{participation: EventExhibitorParticipation; duplicate: boolean}>(ROOT, data, businessId ? {"X-Exhibitor-Business-Id": businessId} : undefined);
    },
    onSuccess: () => client.invalidateQueries({queryKey:["event-exhibitor-participations","mine"]}),
  });
}
export function useWithdrawEventParticipation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<{participation: EventExhibitorParticipation; duplicate: boolean}>(ROOT + "/" + encodeURIComponent(id) + "/withdraw"),
    onSuccess: () => client.invalidateQueries({queryKey:["event-exhibitor-participations","mine"]}),
  });
}
export function useEventApplications(eventId?: string) {
  return useQuery({
    queryKey:["event-exhibitor-participations","event",eventId],
    enabled: Boolean(eventId),
    queryFn: () => api.get<{participations: EventExhibitorParticipation[]}>(ROOT + "/events/" + encodeURIComponent(eventId!)).then(r => r.participations),
  });
}
export function useReviewEventApplication(eventId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: {participationId: string; status:"CONFIRMED"|"REJECTED"; reviewNote?:string}) =>
      api.patch<{participation: EventExhibitorParticipation; duplicate:boolean}>(ROOT + "/events/" + encodeURIComponent(eventId!) + "/" + encodeURIComponent(data.participationId) + "/review", {status:data.status, reviewNote:data.reviewNote}),
    onSuccess: () => {
      client.invalidateQueries({queryKey:["event-exhibitor-participations","event",eventId]});
      client.invalidateQueries({queryKey:["event-exhibitor-participations","mine"]});
    },
  });
}
