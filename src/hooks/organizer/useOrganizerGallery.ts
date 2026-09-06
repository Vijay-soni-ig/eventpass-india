import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { OrganizerGalleryMedia } from "@/types/exhibitor";

const KEY = ["organizer-gallery"];

export type GalleryFilter = "all" | "active" | "inactive" | "archived" | "featured";
export type GallerySort = "custom" | "newest" | "oldest";

export function useOrganizerGallery(filter: GalleryFilter, sort: GallerySort, search?: string) {
  return useQuery({
    queryKey: [...KEY, filter, sort, search],
    queryFn: () => {
      const params = new URLSearchParams({ filter, sort });
      if (search) params.set("search", search);
      return api.get<{ items: OrganizerGalleryMedia[] }>(`/api/organizer/gallery?${params.toString()}`).then((r) => r.items);
    },
  });
}

function invalidateGallery(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: KEY });
}

export function useUploadGalleryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, caption, altText }: { file: File; caption?: string; altText?: string }) => {
      const formData = new FormData();
      formData.append("image", file);
      if (caption) formData.append("caption", caption);
      if (altText) formData.append("altText", altText);
      return api.post<{ item: OrganizerGalleryMedia }>("/api/organizer/gallery", formData);
    },
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useUpdateGalleryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; caption?: string | null; altText?: string | null }) =>
      api.patch<{ item: OrganizerGalleryMedia }>(`/api/organizer/gallery/${id}`, data),
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useSetGalleryItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<{ item: OrganizerGalleryMedia }>(`/api/organizer/gallery/${id}/status`, { active }),
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useSetGalleryItemFeatured() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      api.patch<{ item: OrganizerGalleryMedia }>(`/api/organizer/gallery/${id}/feature`, { featured }),
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useReorderGallery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      api.patch<{ items: OrganizerGalleryMedia[] }>("/api/organizer/gallery/reorder", { items }),
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useBulkGalleryAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "activate" | "deactivate" | "archive" }) =>
      api.patch<{ items: OrganizerGalleryMedia[] }>("/api/organizer/gallery/bulk", { ids, action }),
    onSuccess: () => invalidateGallery(queryClient),
  });
}

export function useArchiveGalleryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/organizer/gallery/${id}`),
    onSuccess: () => invalidateGallery(queryClient),
  });
}
