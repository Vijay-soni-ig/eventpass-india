import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { TeamMember, TeamRole } from "@/types/exhibitor";

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members"],
    queryFn: () => api.get<{ members: TeamMember[] }>("/api/team-members").then((r) => r.members),
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { invitedEmail: string; role: TeamRole }) =>
      api.post<{ member: TeamMember }>("/api/team-members", data).then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useUpdateTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: TeamRole; status?: "active" | "invited" }) =>
      api.patch<{ member: TeamMember }>(`/api/team-members/${id}`, data).then((r) => r.member),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/team-members/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });
}
