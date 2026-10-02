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

export type FloorPlanElementType = "aisle" | "entrance" | "exit" | "stage" | "restroom" | "food" | "info" | "pillar" | "label";

export interface FloorPlanElement {
  id: string;
  floorPlanId: string;
  type: FloorPlanElementType;
  label: string | null;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
  rotation: string | number;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface ElementInput {
  /** Supplying an id lets an undo put a removed element back under its old id. */
  id?: string;
  type: FloorPlanElementType;
  label?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface ElementUpdate {
  elementId: string;
  type?: FloorPlanElementType;
  label?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
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

export function floorPlanDetailKey(exhibitionId: string, floorPlanId: string) {
  return detailKey(exhibitionId, floorPlanId);
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
      api.get<{ floorPlan: FloorPlan; objects: FloorPlanObject[]; elements: FloorPlanElement[] }>(
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
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
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
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
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
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function useDeleteFloorPlanObject(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ objectId, expectedVersion }: { objectId: string; expectedVersion: number }) =>
      api.delete(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/${objectId}?version=${expectedVersion}`),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export interface BulkFloorPlanObjectInput {
  stallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  labelVisible?: boolean;
}

// Places many stalls atomically (one request, one version bump).
export function useBulkAddFloorPlanObjects(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; objects: BulkFloorPlanObjectInput[] }) =>
      api.post<{ created: number; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/bulk`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export interface GenerateStallsInput {
  expectedVersion: number;
  prefix: string;
  startNumber: number;
  padding: number;
  count: number;
  stallType: "premium" | "standard" | "basic";
  size?: string;
  price: number;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  gap: number;
}

// Creates new stalls AND places them on the plan in one atomic step. The stalls
// belong to the exhibition (not just the plan), so the exhibition queries that
// carry `stalls` are refreshed as well.
export function useGenerateStalls(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    invalidateBoth(queryClient, exhibitionId, floorPlanId);
    queryClient.invalidateQueries({ queryKey: ["exhibitions"] });
    queryClient.invalidateQueries({ queryKey: ["exhibitions", exhibitionId] });
  };
  return useMutation({
    mutationFn: (data: GenerateStallsInput) =>
      api.post<{ created: number; version: number; stallIds: string[] }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/generate-stalls`,
        data
      ),
    onSuccess: refresh,
    onError: refresh,
  });
}

export interface BulkObjectUpdate {
  objectId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  labelVisible?: boolean;
}

// Moves/aligns several placed stalls at once (one request, one version bump).
export function useBulkUpdateFloorPlanObjects(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; updates: BulkObjectUpdate[] }) =>
      api.post<{ ok: true; updated: number; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/bulk-update`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

// Removes several stalls from the plan at once; the stalls themselves are kept.
export function useBulkDeleteFloorPlanObjects(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; objectIds: string[] }) =>
      api.post<{ ok: true; deleted: number; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/objects/bulk-delete`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

// Plan elements (aisles, entrances, stages, labels...). Same draft-only, versioned,
// one-bump-per-request contract as the stall endpoints.
export function useAddFloorPlanElements(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; elements: ElementInput[] }) =>
      api.post<{ created: number; ids: string[]; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/elements/bulk`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function useUpdateFloorPlanElements(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; updates: ElementUpdate[] }) =>
      api.post<{ ok: true; updated: number; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/elements/bulk-update`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

export function useDeleteFloorPlanElements(exhibitionId: string, floorPlanId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { expectedVersion: number; elementIds: string[] }) =>
      api.post<{ ok: true; deleted: number; version: number }>(
        `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/elements/bulk-delete`,
        data
      ),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}

// Copies a published/archived plan into a new editable draft.
export function useCloneFloorPlan(exhibitionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (floorPlanId: string) =>
      api
        .post<{ floorPlan: Pick<FloorPlan, "id" | "name" | "status" | "version"> }>(
          `/api/exhibitions/${exhibitionId}/floor-plan-layouts/${floorPlanId}/clone`
        )
        .then((r) => r.floorPlan),
    onSuccess: () => invalidateBoth(queryClient, exhibitionId),
    onError: () => invalidateBoth(queryClient, exhibitionId),
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
    onError: () => invalidateBoth(queryClient, exhibitionId, floorPlanId),
  });
}
