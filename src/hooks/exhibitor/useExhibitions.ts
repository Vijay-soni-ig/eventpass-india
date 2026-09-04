import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition, Stall, TicketType } from "@/types/exhibitor";

export interface CreateExhibitionInput {
  name: string;
  category?: string;
  description?: string;
  venue?: string;
  city?: string;
  startDate?: string;
  endDate?: string;
  status?: "draft" | "live" | "paused" | "completed";
  visibility?: "public" | "private";
  refundPolicy?: string;
  terms?: string;
  ticketTypes?: Array<{ name: string; price: number; quantity: number; taxPercent?: number; visible?: boolean }>;
  stalls?: Array<{ code?: string; stallType?: string; size?: string; price: number }>;
}

export function useExhibitions() {
  return useQuery({
    queryKey: ["exhibitions"],
    queryFn: () => api.get<{ exhibitions: Exhibition[] }>("/api/exhibitions").then((r) => r.exhibitions),
  });
}

export function useExhibition(id: string | undefined) {
  return useQuery({
    queryKey: ["exhibitions", id],
    queryFn: () => api.get<{ exhibition: Exhibition }>(`/api/exhibitions/${id}`).then((r) => r.exhibition),
    enabled: !!id,
  });
}

export function useCreateExhibition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExhibitionInput) =>
      api.post<{ exhibition: Exhibition }>("/api/exhibitions", data).then((r) => r.exhibition),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions"] }),
  });
}

export function useUpdateExhibition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CreateExhibitionInput>) =>
      api.put<{ exhibition: Exhibition }>(`/api/exhibitions/${id}`, data).then((r) => r.exhibition),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", variables.id] });
    },
  });
}

export function useDeleteExhibition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exhibitions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions"] }),
  });
}

export function useDuplicateExhibition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ exhibition: Exhibition }>(`/api/exhibitions/${id}/duplicate`).then((r) => r.exhibition),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions"] }),
  });
}

export function useUploadCover(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("cover", file);
      return api.post<{ exhibition: Exhibition }>(`/api/exhibitions/${exhibitionId}/cover`, formData).then((r) => r.exhibition);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions"] }),
  });
}

export function useUploadFloorPlan(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("floorPlan", file);
      return api.post<{ exhibition: Exhibition }>(`/api/exhibitions/${exhibitionId}/floor-plan`, formData).then((r) => r.exhibition);
    },
    onSuccess: (_d, _f) => queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] }),
  });
}

// -------- Ticket types --------

export function useCreateTicketType(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; price: number; quantity: number; taxPercent?: number; visible?: boolean }) =>
      api.post<{ ticket: TicketType }>(`/api/exhibitions/${exhibitionId}/tickets`, data).then((r) => r.ticket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}

export function useUpdateTicketType(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{ name: string; price: number; quantity: number; taxPercent: number; visible: boolean }>) =>
      api.put<{ ticket: TicketType }>(`/api/exhibitions/${exhibitionId}/tickets/${id}`, data).then((r) => r.ticket),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}

export function useDeleteTicketType(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exhibitions/${exhibitionId}/tickets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}

// -------- Stalls --------

export function useCreateStall(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { code?: string; stallType?: string; size?: string; price: number; posX?: number; posY?: number; width?: number; height?: number }) =>
      api.post<{ stall: Stall }>(`/api/exhibitions/${exhibitionId}/stalls`, data).then((r) => r.stall),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}

export function useUpdateStall(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.put<{ stall: Stall }>(`/api/exhibitions/${exhibitionId}/stalls/${id}`, data).then((r) => r.stall),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}

export function useDeleteStall(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exhibitions/${exhibitionId}/stalls/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
    },
  });
}
