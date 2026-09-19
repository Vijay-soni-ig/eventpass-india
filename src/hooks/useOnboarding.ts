import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { OnboardingSummary } from "@/hooks/useAuth";

export function useOnboarding() {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.get<{ onboarding: OnboardingSummary }>("/api/onboarding").then((r) => r.onboarding),
    staleTime: 30_000,
  });
}
