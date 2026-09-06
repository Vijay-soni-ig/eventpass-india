import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

// Phase 25 — organizer CRUD for the five Exhibition Details content types
// (media/schedule/FAQ/highlights/audience). One generic factory instead of
// five near-duplicate hook files: unlike the backend routes (which followed
// this codebase's existing explicit-per-entity convention, see
// routes/exhibitionContent.ts's own comment on why), TanStack Query hooks
// are pure client-side plumbing with no per-entity authorization logic to
// keep independently readable — a shared factory here doesn't hide any
// security-relevant decision the way it would have on the server.

export interface ExhibitionMedia {
  id: string; exhibitionId: string; imageUrl: string; altText: string | null; caption: string | null;
  sortOrder: number; active: boolean; createdAt: string; updatedAt: string;
}
export interface ExhibitionSchedule {
  id: string; exhibitionId: string; date: string; startTime: string | null; endTime: string | null;
  title: string; description: string | null; sortOrder: number; active: boolean; createdAt: string; updatedAt: string;
}
export interface ExhibitionFAQ {
  id: string; exhibitionId: string; question: string; answer: string;
  sortOrder: number; active: boolean; createdAt: string; updatedAt: string;
}
export interface ExhibitionHighlight {
  id: string; exhibitionId: string; title: string; description: string | null; iconKey: string | null;
  sortOrder: number; active: boolean; createdAt: string; updatedAt: string;
}
export interface ExhibitionAudience {
  id: string; exhibitionId: string; name: string; description: string | null;
  sortOrder: number; active: boolean; createdAt: string; updatedAt: string;
}

function makeContentHooks<TItem extends { id: string }, TCreate, TUpdate>(segment: string, queryKeyPrefix: string) {
  const basePath = (exhibitionId: string) => `/api/exhibitions/${exhibitionId}/${segment}`;

  function useList(exhibitionId: string | undefined) {
    return useQuery({
      queryKey: [queryKeyPrefix, exhibitionId],
      queryFn: () => api.get<{ items: TItem[] }>(basePath(exhibitionId!)).then((r) => r.items),
      enabled: !!exhibitionId,
    });
  }

  function useCreate(exhibitionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: TCreate) => api.post<{ item: TItem }>(basePath(exhibitionId), data).then((r) => r.item),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, exhibitionId] }),
    });
  }

  function useUpdate(exhibitionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...data }: { id: string } & TUpdate) =>
        api.patch<{ item: TItem }>(`${basePath(exhibitionId)}/${id}`, data).then((r) => r.item),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, exhibitionId] }),
    });
  }

  function useRemove(exhibitionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.delete(`${basePath(exhibitionId)}/${id}`),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, exhibitionId] }),
    });
  }

  function useReorder(exhibitionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (items: { id: string; sortOrder: number }[]) => api.patch(`${basePath(exhibitionId)}/reorder`, { items }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, exhibitionId] }),
    });
  }

  return { useList, useCreate, useUpdate, useRemove, useReorder };
}

export const faqHooks = makeContentHooks<
  ExhibitionFAQ,
  { question: string; answer: string },
  { question?: string; answer?: string; active?: boolean }
>("faqs", "exhibition-faqs");

export const highlightHooks = makeContentHooks<
  ExhibitionHighlight,
  { title: string; description?: string; iconKey?: string },
  { title?: string; description?: string | null; iconKey?: string | null; active?: boolean }
>("highlights", "exhibition-highlights");

export const audienceHooks = makeContentHooks<
  ExhibitionAudience,
  { name: string; description?: string },
  { name?: string; description?: string | null; active?: boolean }
>("audience", "exhibition-audience");

export const scheduleHooks = makeContentHooks<
  ExhibitionSchedule,
  { date: string; startTime?: string; endTime?: string; title: string; description?: string },
  { date?: string; startTime?: string | null; endTime?: string | null; title?: string; description?: string | null; active?: boolean }
>("schedule", "exhibition-schedule");

// Media has a real-upload create path (multipart), so it doesn't fit the
// generic factory's plain-JSON useCreate — everything else (list/update/
// delete/reorder) is identical and reuses the same factory.
const mediaBase = makeContentHooks<
  ExhibitionMedia,
  never,
  { caption?: string | null; altText?: string | null; active?: boolean }
>("media", "exhibition-media");

export const mediaHooks = {
  useList: mediaBase.useList,
  useUpdate: mediaBase.useUpdate,
  useRemove: mediaBase.useRemove,
  useReorder: mediaBase.useReorder,
  useUpload(exhibitionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ file, caption, altText }: { file: File; caption?: string; altText?: string }) => {
        const form = new FormData();
        form.append("image", file);
        if (caption) form.append("caption", caption);
        if (altText) form.append("altText", altText);
        return api.post<{ item: ExhibitionMedia }>(`/api/exhibitions/${exhibitionId}/media`, form).then((r) => r.item);
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibition-media", exhibitionId] }),
    });
  },
};
