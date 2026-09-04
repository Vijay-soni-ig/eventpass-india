import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type OrganizerRole = "owner" | "admin" | "operations" | "finance" | "marketing" | "scanner";
export type OrganizerMembershipStatus = "active" | "invited";

export interface OrganizerMembership {
  id: string;
  organizerId: string;
  userId: string | null;
  invitedEmail: string | null;
  role: OrganizerRole;
  status: OrganizerMembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export function useOrganizerMembers(organizerId: string | undefined) {
  return useQuery({
    queryKey: ["organizer-members", organizerId],
    queryFn: () =>
      api.get<{ members: OrganizerMembership[] }>(`/api/organizer-members/${organizerId}`).then((r) => r.members),
    enabled: !!organizerId,
  });
}

export function useInviteOrganizerMember(organizerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { invitedEmail: string; role: OrganizerRole }) =>
      api
        .post<{ member: OrganizerMembership }>(`/api/organizer-members/${organizerId}`, data)
        .then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizer-members", organizerId] }),
  });
}

export function useUpdateOrganizerMember(organizerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: OrganizerRole; status?: OrganizerMembershipStatus }) =>
      api.patch<{ member: OrganizerMembership }>(`/api/organizer-members/member/${id}`, data).then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizer-members", organizerId] }),
  });
}

export function useRemoveOrganizerMember(organizerId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/organizer-members/member/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizer-members", organizerId] }),
  });
}
