import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Business } from "@/types/exhibitor";
import { getActiveExhibitorBusinessId } from "@/lib/apiClient";
import { useMyExhibitorBusinesses } from "@/hooks/exhibitor/useExhibitorMembers";

export function useBusiness() {
  const membershipsQuery = useMyExhibitorBusinesses();
  const memberships = membershipsQuery.data ?? [];
  const activeBusinessId = getActiveExhibitorBusinessId();
  const activeMembership =
    (activeBusinessId
      ? memberships.find((membership) => membership.exhibitorBusinessId === activeBusinessId)
      : undefined) ?? (memberships.length === 1 ? memberships[0] : undefined);
  const isSelectionRequired =
    membershipsQuery.isSuccess && memberships.length > 1 && !activeMembership;

  const businessQuery = useQuery({
    queryKey: ["business", activeMembership?.exhibitorBusinessId ?? "unselected"],
    queryFn: () => api.get<{ business: Business | null }>("/api/business", activeMembership ? { "X-Exhibitor-Business-Id": activeMembership.exhibitorBusinessId } : undefined).then((r) => r.business),
    enabled: membershipsQuery.isSuccess && !isSelectionRequired,
  });

  return {
    ...businessQuery,
    isLoading: membershipsQuery.isLoading || businessQuery.isLoading,
    isError: membershipsQuery.isError || businessQuery.isError,
    isSelectionRequired,
    refetch: async () => {
      const membershipResult = await membershipsQuery.refetch();
      if (membershipResult.isError) return membershipResult;
      const refreshedMemberships = membershipResult.data ?? [];
      const selectedId = getActiveExhibitorBusinessId();
      const hasValidSelection =
        !!selectedId && refreshedMemberships.some((membership) => membership.exhibitorBusinessId === selectedId);
      if (refreshedMemberships.length > 1 && !hasValidSelection) return membershipResult;
      return businessQuery.refetch();
    },
  };
}

export function useUpdateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Business>) => api.put<{ business: Business }>("/api/business", data).then((r) => r.business),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business"] }),
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      return api.post<{ business: Business }>("/api/business/logo", formData).then((r) => r.business);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business"] }),
  });
}
