import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/apiClient";
import type { Exhibition, KycStatus, StallStatus, StallType } from "@/types/exhibitor";

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
    // 001E homepage read cutover: the homepage keeps its established
    // Exhibition-shaped card contract, but the source of truth is now the
    // canonical Event discovery API. This lets standalone Universal Events
    // participate in homepage discovery without requiring an Exhibition row.
    queryKey: ["public-events", { source: "homepage" }],
    queryFn: async () => {
      const response = await api.get<{
        events: Array<{
          id: string;
          title: string;
          description: string | null;
          eventType: string;
          category: { id: string; name: string; slug: string } | null;
          startDate: string | null;
          endDate: string | null;
          venue: string | null;
          city: string | null;
          latitude: number | null;
          longitude: number | null;
          coverImageUrl: string | null;
          organizer: { id: string; name: string; slug: string | null; logoUrl: string | null };
          exhibition: { id: string } | null;
        }>;
      }>("/api/public/events?sort=newest&limit=50");

      return response.events.map((event): Exhibition => ({
        id: event.exhibition?.id ?? event.id,
        eventId: event.id,
        ownerId: event.organizer.id,
        name: event.title,
        category: event.category?.name ?? null,
        description: event.description,
        venue: event.venue,
        city: event.city,
        latitude: event.latitude,
        longitude: event.longitude,
        startDate: event.startDate,
        endDate: event.endDate,
        coverImageUrl: event.coverImageUrl,
        floorPlanUrl: null,
        status: "live",
        visibility: "public",
        refundPolicy: null,
        terms: null,
        createdAt: event.startDate ?? new Date(0).toISOString(),
        updatedAt: event.startDate ?? new Date(0).toISOString(),
      }));
    },
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

// Deliberately narrower than the full `Stall` type: the public floor-plan
// endpoint (server/src/routes/public.ts) only ever selects these fields —
// never buyerName/buyerEmail or any other private commercial data. Typing
// this as `Stall` would claim fields (exhibitionId, posX/posY, buyerName,
// createdAt, ...) that are never actually present on the wire.
export interface PublicStallSummary {
  id: string;
  code: string | null;
  stallType: StallType | null;
  price: string | number;
  status: StallStatus;
}

export interface PublicFloorPlanObject {
  id: string;
  stallId: string;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
  rotation: string | number;
  zIndex: number;
  labelVisible: boolean;
  stall: PublicStallSummary;
}

export interface PublicFloorPlanElement {
  id: string;
  type: string;
  label: string | null;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
  rotation: string | number;
  zIndex: number;
}

export interface PublicFloorPlan {
  id: string;
  /** The hall this plan covers (present on plans served after halls were introduced). */
  hall?: { id: string; name: string };
  exhibitionId: string;
  name: string;
  backgroundUrl: string | null;
  canvasWidth: string | number;
  canvasHeight: string | number;
  publishedAt: string | null;
  objects: PublicFloorPlanObject[];
  /** Aisles, entrances, labels... Absent on plans published before elements existed. */
  elements?: PublicFloorPlanElement[];
}

/**
 * The published floor-plan map is optional — most exhibitions haven't
 * published one, in which case the endpoint 404s. That's an expected "no
 * data" outcome, not an error state, so we disable retries and translate a
 * 404 into `null` via `select` rather than letting it surface as `isError`.
 */
export function usePublicFloorPlan(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["public-floor-plan", exhibitionId],
    queryFn: async () => {
      try {
        const res = await api.get<{ floorPlan: PublicFloorPlan }>(`/api/public/exhibitions/${exhibitionId}/floor-plan`);
        return res.floorPlan;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!exhibitionId,
    retry: false,
  });
}

/**
 * Every hall's published plan, in hall order. Unlike the single-plan hook an
 * empty list is a normal answer ("nothing published"), not a 404.
 */
export function usePublicFloorPlans(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: ["public-floor-plans", exhibitionId],
    queryFn: () =>
      api.get<{ floorPlans: PublicFloorPlan[] }>(`/api/public/exhibitions/${exhibitionId}/floor-plans`).then((r) => r.floorPlans),
    enabled: !!exhibitionId,
    retry: false,
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
