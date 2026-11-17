import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ExhibitionAddOn {
  id: string;
  exhibitionId: string;
  name: string;
  description: string | null;
  price: string | number;
  maxQuantityPerBooking: number;
  availableFrom: string | null;
  availableUntil: string | null;
  sortOrder: number;
  status: "active" | "inactive";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExhibitionAddOnInput {
  name: string;
  description?: string | null;
  price: number;
  maxQuantityPerBooking: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  sortOrder?: number;
}

export function useExhibitionAddOns(exhibitionId: string | undefined, includeArchived = true) {
  return useQuery({
    queryKey: ["exhibitions", exhibitionId, "add-ons", includeArchived],
    queryFn: () =>
      api.get<{ addOns: ExhibitionAddOn[] }>(
        `/api/exhibitions/${exhibitionId}/add-ons${includeArchived ? "?includeArchived=true" : ""}`
      ).then((response) => response.addOns),
    enabled: !!exhibitionId,
  });
}

export function useCreateExhibitionAddOn(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExhibitionAddOnInput) =>
      api.post<{ addOn: ExhibitionAddOn }>(`/api/exhibitions/${exhibitionId}/add-ons`, input).then((response) => response.addOn),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId, "add-ons"] }),
  });
}

export function useUpdateExhibitionAddOn(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<ExhibitionAddOnInput> & { status?: "active" | "inactive" }) =>
      api.patch<{ addOn: ExhibitionAddOn }>(`/api/exhibitions/${exhibitionId}/add-ons/${id}`, input).then((response) => response.addOn),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId, "add-ons"] }),
  });
}

export function useArchiveExhibitionAddOn(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exhibitions/${exhibitionId}/add-ons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId, "add-ons"] }),
  });
}

export function useRestoreExhibitionAddOn(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ addOn: ExhibitionAddOn }>(`/api/exhibitions/${exhibitionId}/add-ons/${id}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId, "add-ons"] }),
  });
}
