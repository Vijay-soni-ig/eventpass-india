import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface VisitorPreference {
  preferredCategoryIds: string[];
  preferredCities: string[];
}

const SESSION_KEY = "exhibittix:personalization-session";

export function getPersonalizationSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function trackPersonalizationInteraction(input: {
  eventId?: string;
  type: "VIEW" | "CLICK" | "SAVE" | "REGISTER" | "PURCHASE" | "CHECK_IN" | "SEARCH" | "RECOMMENDATION_IMPRESSION" | "RECOMMENDATION_DISMISS" | "RECOMMENDATION_NOT_INTERESTED";
  metadata?: Record<string, unknown>;
}) {
  return api.post<void>("/api/personalization/interactions", {
    ...input,
    sessionId: getPersonalizationSessionId(),
  });
}

export function useVisitorPreferences(enabled = true) {
  return useQuery({
    queryKey: ["visitor-personalization-preferences"],
    queryFn: () => api.get<{ preference: VisitorPreference }>("/api/personalization/preferences").then((r) => r.preference),
    enabled,
    retry: false,
  });
}

export function useSaveVisitorPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preference: VisitorPreference) =>
      api.put<{ preference: VisitorPreference }>("/api/personalization/preferences", preference),
    onSuccess: ({ preference }) => {
      queryClient.setQueryData(["visitor-personalization-preferences"], preference);
      queryClient.invalidateQueries({ queryKey: ["personalization-recommendations"] });
    },
  });
}
