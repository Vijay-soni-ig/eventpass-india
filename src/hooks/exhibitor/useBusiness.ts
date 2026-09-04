import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Business } from "@/types/exhibitor";

export function useBusiness() {
  return useQuery({
    queryKey: ["business"],
    queryFn: () => api.get<{ business: Business | null }>("/api/business").then((r) => r.business),
  });
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
