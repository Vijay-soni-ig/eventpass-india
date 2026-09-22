import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type FloorPlanStatus = "draft" | "published" | "archived";

export interface FloorPlan {
  id: string;
  exhibitionId: string;
  name: string;
  status: FloorPlanStatus;
  version: number;
  backgroundUrl: string | null;
  canvasWidth: string | number;
  canvasHeight: string | number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanObject {
  id: string;
  floorPlanId: string;
  stallId: string;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
  rotation: string | number;
  zIndex: number;
  labelVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFloorPlanInput {
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl?: string | null;
}

export interface UpdateFloorPlanInput {
  expectedVersion: number;
  name?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  backgroundUrl?: string | null;
}

export interface FloorPlanObjectInput {
  expectedVersion: number;
  stallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  labelVisible?: boolean;
}

export type UpdateFloorPlanObjectInput = Partial<Omit<FloorPlanObjectInput, "expectedVersion">>;

function listKey(exhibitionId: string) {
  return ["floor-plan-layouts", exhibitionId] as const;
}

function detailKey(exhibitionId: string, floorPlanId: string) {
  return ["floor-plan-layouts", exhibitionId, floorPlanId] as const;
}

export function useFloorPlans(exhibitionId: string | undefined) {
  return useQuery({
    queryKey: listKey(exhibitionId ?? ""),
    queryFn: () =>
      api
        .get<{ floorPlans: FloorPlan[] }>(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`)
        .then((r) => r.floorPlans),
    enabled: !!exhibitionId,
  });
}

export function useFloorPlan(exhibitionId: string | undefined, floorPlanId: string | undefined) {
  return useQuery({
    queryKey: detailKey(exhibitionId ?? "", floorPlanId ?? ""),
    queryFn: () =>
      api.get<{ floorPlan: FloorPlan; objects: FloorPlanObject[] }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}`
      ),
    enabled: !!exhibitionId && !!floorPlanId,
  });
}

function invalidateBoth(
  queryClient: ReturnType<typeof useQueryClient>,
  exhibitionId: string,
  floorPlanId?: string
) {
  queryClient.invalidateQueries({ queryKey: listKey(exhibitionId) });
  if (floorPlanId) {
    queryClient.invalidateQueries({ queryKey: detailKey(exhibitionId, floorPlanId) });
  }
}

export function useCreateFloorPlan(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFloorPlanInput) =>
      api
        .post<{ floorPlan: FloorPlan }>(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`, data)
        .then((r) => r.floorPlan),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId),
  });
}

// Note: the server's PATCH handler currently replies with `{ ok: true }`
// rather than echoing the updated floor plan, so callers should rely on the
// query invalidation below (not the mutation's return value) to see fresh
// data.
export function useUpdateFloorPlan(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateFloorPlanInput) =>
      api.patch<{ ok: true; version: number }>(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}`, data),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function useAddFloorPlanObject(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FloorPlanObjectInput) =>
      api
        .post<{ object: FloorPlanObject }>(
          `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects`,
          data
        )
        .then((r) => r.object),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

// Same caveat as useUpdateFloorPlan: the server replies `{ ok: true }` for
// object updates too, so consumers should read the refetched `useFloorPlan`
// data rather than this mutation's return value.
export function useUpdateFloorPlanObject(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, expectedVersion, ...data }: { objectId: string; expectedVersion: number } & UpdateFloorPlanObjectInput) =>
      api.patch<{ ok: true; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/${objectId}`,
        { expectedVersion, ...data }
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function useDeleteFloorPlanObject(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, expectedVersion }: { objectId: string; expectedVersion: number }) =>
      api.delete(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/${objectId}?version=${expectedVersion}`),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function usePublishFloorPlan(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion: number) =>
      api.post<{ ok: true; status: string; version?: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/publish`,
        { expectedVersion }
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}
