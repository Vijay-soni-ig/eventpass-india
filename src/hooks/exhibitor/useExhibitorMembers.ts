import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type ExhibitorRole = "owner" | "admin" | "staff";
export type ExhibitorMembershipStatus = "active" | "invited";

export interface ExhibitorMembership {
  id: string;
  exhibitorBusinessId: string;
  userId: string | null;
  invitedEmail: string | null;
  role: ExhibitorRole;
  status: ExhibitorMembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export function useExhibitorMembers(exhibitorBusinessId: string | undefined) {
  return useQuery({
    queryKey: ["exhibitor-members", exhibitorBusinessId],
    queryFn: () =>
      api
        .get<{ members: ExhibitorMembership[] }>(`/api/exhibitor-members/${exhibitorBusinessId}`)
        .then((r) => r.members),
    enabled: !!exhibitorBusinessId,
  });
}

// Phase 21D: this file previously exposed only the read-only lookup above
// (used by LeadDetail.tsx's "assign to" dropdown). The exhibitor Team page
// (TeamRoles.tsx) was wired to an entirely different, legacy V1
// TeamMember/`/api/team-members` system instead of this real, tenant-
// isolated ExhibitorMembership one — these mutations complete this hook so
// that page can be rewired to the real system, mirroring
// hooks/organizer/useOrganizerMembers.ts's shape exactly.

export function useInviteExhibitorMember(exhibitorBusinessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { invitedEmail: string; role: ExhibitorRole }) =>
      api
        .post<{ member: ExhibitorMembership }>(`/api/exhibitor-members/${exhibitorBusinessId}`, data)
        .then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitor-members", exhibitorBusinessId] }),
  });
}

export function useUpdateExhibitorMember(exhibitorBusinessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: ExhibitorRole; status?: ExhibitorMembershipStatus }) =>
      api.patch<{ member: ExhibitorMembership }>(`/api/exhibitor-members/member/${id}`, data).then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitor-members", exhibitorBusinessId] }),
  });
}

export function useRemoveExhibitorMember(exhibitorBusinessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/exhibitor-members/member/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exhibitor-members", exhibitorBusinessId] }),
  });
}
