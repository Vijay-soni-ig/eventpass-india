import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOrganizerSubscriptions, type EntitlementUsage } from "@/hooks/organizer/useSubscription";

const RESOURCE_LABEL: Record<EntitlementUsage["resource"], string> = {
  exhibition: "Active exhibitions",
  exhibitor: "Exhibitors",
  visitor: "Visitors",
  stall: "Stalls",
  team_member: "Team members",
};

/**
 * Phase 20C — informational only. Every number here is a live read from
 * the same entitlementService.ts the backend uses to actually decide
 * whether an action is allowed, but this card itself never blocks
 * anything — it's a courtesy heads-up before an organizer hits a real,
 * backend-enforced limit. "Upgrade" has no checkout to route to (Razorpay/
 * subscription billing remain deferred — see docs/PHASE_20A/20B/20C), so it
 * points at the existing team/settings contact path instead of pretending
 * to process a plan change.
 */
export function PlanUsageCard() {
  const { data: subscriptions, isLoading } = useOrganizerSubscriptions();
  if (isLoading || !subscriptions || subscriptions.length === 0) return null;

  // An organizer typically belongs to one organizer tenant — show the first with a real subscription.
  const entry = subscriptions.find((s) => s.subscription) ?? subscriptions[0];
  if (!entry.subscription) return null;

  const { plan, status } = entry.subscription;
  const nearOrOverLimit = entry.usage.filter((u) => u.limit !== null && u.currentUsage >= u.limit * 0.8);
  const overLimit = entry.usage.filter((u) => u.limit !== null && u.currentUsage >= u.limit);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {plan.name} plan {status === "trialing" && <span className="text-muted-foreground font-normal">(free first exhibition)</span>}
          </p>
          {entry.trialConsumed && status === "trialing" && (
            <p className="text-xs text-muted-foreground">Your free first exhibition has been used.</p>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/organizer/settings">Manage plan</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entry.usage.map((u) => {
          const pct = u.limit === null ? 0 : Math.min(100, (u.currentUsage / u.limit) * 100);
          return (
            <div key={u.resource} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{RESOURCE_LABEL[u.resource]}</span>
                <span className={u.limit !== null && u.currentUsage >= u.limit ? "text-destructive font-medium" : ""}>
                  {u.currentUsage.toLocaleString("en-IN")} / {u.limit === null ? "Unlimited" : u.limit.toLocaleString("en-IN")}
                </span>
              </div>
              {u.limit !== null && <Progress value={pct} className="h-1.5" />}
            </div>
          );
        })}
      </div>

      {overLimit.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>You've reached your {plan.name} plan limit</AlertTitle>
          <AlertDescription>
            {overLimit.map((u) => RESOURCE_LABEL[u.resource]).join(", ")} {overLimit.length === 1 ? "is" : "are"} at capacity. Contact an admin to
            upgrade your plan.
          </AlertDescription>
        </Alert>
      ) : nearOrOverLimit.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Approaching your plan limit</AlertTitle>
          <AlertDescription>{nearOrOverLimit.map((u) => RESOURCE_LABEL[u.resource]).join(", ")} {nearOrOverLimit.length === 1 ? "is" : "are"} close to capacity.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
