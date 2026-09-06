import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Organizer, OrganizerSocialLink } from "@/types/exhibitor";

const KEY = ["organizer-profile"];

export function useOrganizerProfile() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ organizer: Organizer | null }>("/api/organizer/profile").then((r) => r.organizer),
  });
}

export interface OrganizerProfileUpdate {
  description?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  publicEmail?: string;
  publicPhone?: string;
  publicProfileEnabled?: boolean;
  slug?: string;
}

export function useUpdateOrganizerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OrganizerProfileUpdate) => api.put<{ organizer: Organizer }>("/api/organizer/profile", data),
    onSuccess: (data) => queryClient.setQueryData(KEY, data.organizer),
  });
}

export function useUploadOrganizerLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      return api.post<{ organizer: Organizer }>("/api/organizer/profile/logo", formData);
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data.organizer),
  });
}

export function useUploadOrganizerCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("cover", file);
      return api.post<{ organizer: Organizer }>("/api/organizer/profile/cover", formData);
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data.organizer),
  });
}

function invalidateProfile(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: KEY });
}

export function useAddSocialLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { platform: string; url: string }) =>
      api.post<{ socialLink: OrganizerSocialLink }>("/api/organizer/profile/social-links", data),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useUpdateSocialLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; url?: string; sortOrder?: number; active?: boolean }) =>
      api.patch<{ socialLink: OrganizerSocialLink }>(`/api/organizer/profile/social-links/${id}`, data),
    onSuccess: () => invalidateProfile(queryClient),
  });
}

export function useDeleteSocialLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/organizer/profile/social-links/${id}`),
    onSuccess: () => invalidateProfile(queryClient),
  });
}
