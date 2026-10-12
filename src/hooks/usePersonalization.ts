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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Personalization telemetry is best-effort. Public/legacy fixtures can include
 * non-UUID event identifiers even though the interactions API requires UUIDs;
 * never let invalid analytics payloads or a transient analytics outage break
 * the page the visitor is using.
 */
export async function trackPersonalizationInteraction(input: {
  eventId?: string;
  type: "VIEW" | "CLICK" | "SAVE" | "REGISTER" | "PURCHASE" | "CHECK_IN" | "SEARCH" | "RECOMMENDATION_IMPRESSION" | "RECOMMENDATION_DISMISS" | "RECOMMENDATION_NOT_INTERESTED";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (input.eventId && !UUID_PATTERN.test(input.eventId)) return;

  try {
    await api.post<void>("/api/personalization/interactions", {
      ...input,
      sessionId: getPersonalizationSessionId(),
    });
  } catch {
    // Analytics must not produce an unhandled rejection or interrupt navigation.
  }
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
