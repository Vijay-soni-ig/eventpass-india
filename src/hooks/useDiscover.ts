import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { DiscoverEventsResponse, DiscoverOrganizersResponse, DiscoverType } from "@/types/discovery";

// Same rationale as usePublicExhibitions.ts's PUBLIC_QUERY_OPTIONS: a
// visitor-facing public page, so a single quick retry surfaces a real
// outage promptly instead of leaving the page on "Loading..." for the
// default multi-attempt backoff.
const PUBLIC_QUERY_OPTIONS = { retry: 1, retryDelay: 500 } as const;

export interface DiscoverParams {
  type: DiscoverType;
  q?: string;
  category?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  // Phase 22.5 — events only, migrated from ExhibitionListing.tsx's price
  // slider (see the discover route's own doc comment: this is the event's
  // minimum visible ticket type price, not a field on Exhibition itself).
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  page: number;
  limit?: number;
  // Nearby search (homepage "Events Near You") — all three required together
  // server-side; see routes/public.ts.
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

function buildQueryString(params: DiscoverParams): string {
  const usp = new URLSearchParams();
  usp.set("type", params.type);
  if (params.q) usp.set("q", params.q);
  if (params.category) usp.set("category", params.category);
  if (params.city) usp.set("city", params.city);
  if (params.dateFrom) usp.set("dateFrom", params.dateFrom);
  if (params.dateTo) usp.set("dateTo", params.dateTo);
  if (params.minPrice !== undefined) usp.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) usp.set("maxPrice", String(params.maxPrice));
  if (params.sort) usp.set("sort", params.sort);
  if (params.lat !== undefined) usp.set("lat", String(params.lat));
  if (params.lng !== undefined) usp.set("lng", String(params.lng));
  if (params.radiusKm !== undefined) usp.set("radiusKm", String(params.radiusKm));
  usp.set("page", String(params.page));
  if (params.limit) usp.set("limit", String(params.limit));
  return usp.toString();
}

// Stale-response protection (spec §29) is handled by TanStack Query's own
// keying, not a manual AbortController: `useDiscover` keys its cache entry
// on the full `params` object, so an in-flight request for an OLDER params
// combination resolves into that OLDER cache entry — never into whatever
// entry the component is currently reading, which always corresponds to
// the LATEST params. A component always renders `useDiscover(currentParams)`,
// so a late-arriving stale response can never visually overwrite a fresher
// one; no request cancellation is needed for correctness.
export function useDiscover(params: DiscoverParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["discover", params],
    queryFn: () =>
      api.get<DiscoverEventsResponse | DiscoverOrganizersResponse>(`/api/public/discover?${buildQueryString(params)}`),
    enabled: options.enabled ?? true,
    ...PUBLIC_QUERY_OPTIONS,
  });
}
