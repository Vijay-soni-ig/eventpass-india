import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  price: string | number;
  currency: string;
  eventLimit: number | null;
  visitorLimit: number | null;
  exhibitorLimit: number | null;
  stallLimit: number | null;
  teamMemberLimit: number | null;
}

export interface OrganizerSubscription {
  id: string;
  status: "trialing" | "active" | "cancelled" | "expired" | "inactive";
  plan: SubscriptionPlan;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface EntitlementUsage {
  resource: "exhibition" | "exhibitor" | "visitor" | "stall" | "team_member";
  currentUsage: number;
  limit: number | null;
}

export interface OrganizerSubscriptionEntry {
  organizer: { id: string; name: string };
  subscription: OrganizerSubscription | null;
  usage: EntitlementUsage[];
  trialConsumed: boolean;
}

/**
 * The caller's own subscription(s) + live plan-limit usage — read-only,
 * informational (Phase 20C's own principle: the backend write-time checks
 * in entitlementService.ts are what actually enforce anything; this is
 * only ever used to show a usage indicator / upgrade nudge in the UI).
 */
export function useOrganizerSubscriptions(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["organizer-subscription-entitlement"],
    queryFn: () => api.get<{ subscriptions: OrganizerSubscriptionEntry[] }>("/api/organizer/subscription").then((r) => r.subscriptions),
    // Defaults to true (unchanged behavior for real organizer callers like
    // PlanUsageCard). Callers that might run for a pure-exhibitor account
    // with zero organizer memberships (e.g. the shared Settings page) should
    // pass `enabled: false` in that case — the backend correctly 403s such a
    // request (same RBAC as every other organizer-scoped route), but there's
    // no reason to fire a request guaranteed to fail (Phase 21D).
    enabled: options.enabled ?? true,
  });
}
