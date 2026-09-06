import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/apiClient";
import type { Organizer, Exhibition, OrganizerGalleryMedia } from "@/types/exhibitor";

// Same rationale as usePublicExhibitions.ts's PUBLIC_QUERY_OPTIONS: these
// back a visitor-facing public page, so a single quick retry surfaces a real
// outage promptly instead of leaving the page on "Loading..." for the
// default multi-attempt backoff.
const PUBLIC_QUERY_OPTIONS = { retry: 1, retryDelay: 500 } as const;

export function usePublicOrganizer(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-organizer", slug],
    queryFn: () => api.get<{ organizer: Organizer }>(`/api/public/organizers/${slug}`).then((r) => r.organizer),
    enabled: !!slug,
    ...PUBLIC_QUERY_OPTIONS,
  });
}

export function usePublicOrganizerEvents(slug: string | undefined, type: "upcoming" | "past") {
  return useQuery({
    queryKey: ["public-organizer-events", slug, type],
    queryFn: () =>
      api
        .get<{ exhibitions: Exhibition[]; total: number }>(`/api/public/organizers/${slug}/events?type=${type}`)
        .then((r) => r),
    enabled: !!slug,
    ...PUBLIC_QUERY_OPTIONS,
  });
}

export function usePublicOrganizerGallery(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-organizer-gallery", slug],
    queryFn: () => api.get<{ items: OrganizerGalleryMedia[] }>(`/api/public/organizers/${slug}/gallery`).then((r) => r.items),
    enabled: !!slug,
    ...PUBLIC_QUERY_OPTIONS,
  });
}

interface FollowState {
  following: boolean;
  followerCount: number;
}

export function useOrganizerFollowState(organizerId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["organizer-follow-state", organizerId],
    queryFn: () => api.get<FollowState>(`/api/organizers/${organizerId}/follow-state`),
    enabled: enabled && !!organizerId,
    // UI-02B: a 404 here means this organizer doesn't have a public profile
    // enabled (see server/src/routes/organizerFollows.ts's own
    // publicProfileEnabled gate) — not a transient failure, so retrying
    // can't help and would just be a repeated, pointless 404. Every other
    // error still gets the usual single retry.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 1,
    retryDelay: PUBLIC_QUERY_OPTIONS.retryDelay,
  });
}

export function useFollowOrganizer(organizerId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["organizer-follow-state", organizerId];

  const follow = useMutation({
    mutationFn: () => api.post<FollowState>(`/api/organizers/${organizerId}/follow`),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  const unfollow = useMutation({
    mutationFn: () => api.delete<FollowState>(`/api/organizers/${organizerId}/follow`),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  return { follow, unfollow };
}
