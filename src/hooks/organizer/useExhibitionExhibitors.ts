import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Stall } from "@/types/exhibitor";
import type { ParticipationStatus } from "@/hooks/exhibitor/useParticipations";

export interface ExhibitionExhibitor {
  id: string;
  exhibitionId: string;
  exhibitorBusinessId: string;
  status: ParticipationStatus;
  boothNumber: string | null;
  invitedAt: string;
  confirmedAt: string | null;
  business?: { id: string; companyName: string | null };
  stalls?: Stall[];
}

export function useExhibitionExhibitors(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["exhibition-exhibitors", exhibitionId],
    queryFn: () =>
      api
        .get<{ participants: ExhibitionExhibitor[] }>(`/api/exhibitions/${exhibitionId}/exhibitors`)
        .then((r) => r.participants),
    enabled: !!exhibitionId,
  });
}

export function useReviewApplication(exhibitionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ participantId, status }: { participantId: string; status: "approved" | "rejected" }) =>
      api
        .patch<{ participant: ExhibitionExhibitor }>(`/api/exhibitions/${exhibitionId}/exhibitors/${participantId}`, {
          status,
        })
        .then((r) => r.participant),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibition-exhibitors", exhibitionId] }),
  });
}
