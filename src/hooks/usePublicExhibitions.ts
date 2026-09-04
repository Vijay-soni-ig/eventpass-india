import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition } from "@/types/exhibitor";

export function usePublicExhibitions() {
  return useQuery({
    queryKey: ["public-exhibitions"],
    queryFn: () => api.get<{ exhibitions: Exhibition[] }>("/api/public/exhibitions").then((r) => r.exhibitions),
  });
}

export function usePublicExhibition(id: string | undefined) {
  return useQuery({
    queryKey: ["public-exhibitions", id],
    queryFn: () => api.get<{ exhibition: Exhibition }>(`/api/public/exhibitions/${id}`).then((r) => r.exhibition),
    enabled: !!id,
  });
}
