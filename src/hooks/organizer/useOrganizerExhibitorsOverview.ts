import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition } from "@/types/exhibitor";
import type { ExhibitionExhibitor } from "./useExhibitionExhibitors";

export interface OrganizerExhibitorRow extends ExhibitionExhibitor {
  exhibitionName: string;
}

// A cross-exhibition "all exhibitors/applications" view for the organizer
// sidebar's Exhibitors entry. There is deliberately no new backend endpoint
// here — it fans out over the exact same two routes the per-exhibition
// "Exhibitors" tab already uses (GET /api/exhibitions, then
// GET /api/exhibitions/:id/exhibitors per exhibition the organizer can see),
// so tenant scoping and permissions are enforced exactly as they already are
// server-side; this hook only aggregates what those calls return. It shares
// the same query keys as useExhibitionExhibitors, so approving/rejecting
// from either surface invalidates the same cache entries.
export function useOrganizerExhibitorsOverview() {
  const exhibitionsQuery = useQuery({
    queryKey: ["exhibitions"],
    queryFn: () => api.get<{ exhibitions: Exhibition[] }>("/api/exhibitions").then((r) => r.exhibitions),
  });
  const exhibitions = exhibitionsQuery.data ?? [];

  const participantQueries = useQueries({
    queries: exhibitions.map((ex) => ({
      queryKey: ["exhibition-exhibitors", ex.id],
      queryFn: () =>
        api.get<{ participants: ExhibitionExhibitor[] }>(`/api/exhibitions/${ex.id}/exhibitors`).then((r) => r.participants),
      enabled: !!ex.id,
    })),
  });

  const isLoading = exhibitionsQuery.isLoading || participantQueries.some((q) => q.isLoading);
  const isError = exhibitionsQuery.isError || participantQueries.some((q) => q.isError);

  const rows: OrganizerExhibitorRow[] = exhibitions.flatMap((ex, i) => {
    const participants = participantQueries[i]?.data ?? [];
    return participants.map((p) => ({ ...p, exhibitionName: ex.name }));
  });

  const refetch = () => {
    exhibitionsQuery.refetch();
    participantQueries.forEach((q) => q.refetch());
  };

  return { rows, exhibitions, isLoading, isError, refetch };
}
