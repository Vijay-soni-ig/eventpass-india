import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition, KycStatus } from "@/types/exhibitor";

export interface PublicExhibitor {
  id: string;
  boothNumber: string | null;
  business: {
    id: string;
    companyName: string | null;
    businessType: string | null;
    logoUrl: string | null;
    kycStatus: KycStatus;
  };
}

export interface PublicExhibitorsResponse {
  exhibitors: PublicExhibitor[];
  total: number;
  page: number;
  pageSize: number;
}

// The QueryClient uses TanStack Query's default retry policy (3 attempts
// with exponential backoff, ~7+ seconds total) — fine for an authenticated
// dashboard where a transient blip is worth retrying quietly, but these two
// hooks back the public homepage and exhibition-detail pages, a visitor's
// first impression. A single quick retry keeps `isError` from taking many
// seconds to become true, so a real outage shows an error state promptly
// instead of leaving the visitor on "Loading..." far longer than necessary.
const PUBLIC_QUERY_OPTIONS = { retry: 1, retryDelay: 500 } as const;

export function usePublicExhibitions() {
  return useQuery({
    queryKey: ["public-exhibitions"],
    queryFn: () => api.get<{ exhibitions: Exhibition[] }>("/api/public/exhibitions").then((r) => r.exhibitions),
    ...PUBLIC_QUERY_OPTIONS,
  });
}

export function usePublicExhibition(id: string | undefined) {
  return useQuery({
    queryKey: ["public-exhibitions", id],
    queryFn: () => api.get<{ exhibition: Exhibition }>(`/api/public/exhibitions/${id}`).then((r) => r.exhibition),
    enabled: !!id,
    ...PUBLIC_QUERY_OPTIONS,
  });
}

export function usePublicExhibitionExhibitors(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: ["public-exhibition-exhibitors", id, page],
    queryFn: () =>
      api.get<PublicExhibitorsResponse>(`/api/public/exhibitions/${id}/exhibitors?page=${page}`),
    enabled: !!id,
    ...PUBLIC_QUERY_OPTIONS,
  });
}
