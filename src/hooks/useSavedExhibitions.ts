import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition } from "@/types/exhibitor";

// Phase 23.3 — event save/unsave, mirroring usePublicOrganizer.ts's
// follow/unfollow hooks exactly (same query-key + setQueryData-on-success
// shape), applied to the new SavedExhibition model.
const PUBLIC_QUERY_OPTIONS = { retry: 1, retryDelay: 500 } as const;

interface SaveState {
  saved: boolean;
}

export function useSaveState(exhibitionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["saved-exhibition-state", exhibitionId],
    queryFn: () => api.get<SaveState>(`/api/saved-exhibitions/${exhibitionId}`),
    enabled: enabled && !!exhibitionId,
    ...PUBLIC_QUERY_OPTIONS,
  });
}

export function useSaveExhibition(exhibitionId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["saved-exhibition-state", exhibitionId];

  const save = useMutation({
    mutationFn: () => api.post<SaveState>(`/api/saved-exhibitions/${exhibitionId}`),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: ["saved-exhibitions-list"] });
    },
  });

  const unsave = useMutation({
    mutationFn: () => api.delete<SaveState>(`/api/saved-exhibitions/${exhibitionId}`),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      queryClient.invalidateQueries({ queryKey: ["saved-exhibitions-list"] });
    },
  });

  return { save, unsave };
}

export interface SavedExhibitionEntry {
  id: string;
  createdAt: string;
  available: boolean;
  exhibition: Partial<Exhibition> & { id: string };
}

interface SavedExhibitionsPage {
  items: SavedExhibitionEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export function useSavedExhibitionsList(page: number) {
  return useQuery({
    queryKey: ["saved-exhibitions-list", page],
    queryFn: () => api.get<SavedExhibitionsPage>(`/api/saved-exhibitions?page=${page}&limit=20`),
    ...PUBLIC_QUERY_OPTIONS,
  });
}
