import { useState } from "react";
import { Calendar, CreditCard, DollarSign, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  usePlatformOrganizerSubscription,
  usePlatformPlans,
  useActivateSubscription,
  useCancelSubscription,
  useExpireSubscription,
  useChangeSubscriptionPlan,
} from "@/hooks/platform/usePlatformAdmin";
import { ApiError } from "@/lib/apiClient";

// Phase 20B — administrative subscription lifecycle actions only. There is
// no payment collection here (Razorpay remains deferred): "Activate" just
// records that a platform admin has confirmed the organizer converted to a
// paid plan by some means outside this system. Plan LIMITS shown below are
// informational only — nothing in the product enforces them yet (Phase
// 20C). Shared between the organizer detail page and the platform
// Subscriptions page's detail drawer — one set of subscription actions,
// not two copies.
const USAGE_RESOURCE_LABEL: Record<string, string> = {
  exhibition: "Active exhibitions",
  exhibitor: "Exhibitors",
  visitor: "Visitors",
  stall: "Stalls",
  team_member: "Team members",
};

export function SubscriptionPanel({
  organizerId,
  data,
}: {
  organizerId: string;
  data: ReturnType<typeof usePlatformOrganizerSubscription>["data"];
}) {
  const { data: plans = [] } = usePlatformPlans();
  const activate = useActivateSubscription();
  const cancel = useCancelSubscription();
  const expire = useExpireSubscription();
  const changePlan = useChangeSubscriptionPlan();
  const [confirmAction, setConfirmAction] = useState<"cancel" | "expire" | null>(null);

  const subscription = data?.subscription;
  if (!subscription) {
    return <EmptyState icon={CreditCard} title="No subscription found" description="This organizer has no subscription record yet." />;
  }
  const usage = data?.usage ?? [];
  const trialConsumed = data?.trialConsumed ?? false;

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "That action failed");
  const plan = subscription.plan;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Plan" value={plan.name} icon={CreditCard} />
        <div className="bg-card border border-border rounded-lg p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="mt-1">
              <StatusBadge status={subscription.status} />
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
        </div>
        <StatCard title="Price" value={plan.code === "enterprise" ? "Custom" : `₹${Number(plan.price).toLocaleString("en-IN")}`} icon={DollarSign} />
        <StatCard
          title="Trial"
          value={subscription.status === "trialing" ? (trialConsumed ? "Used" : "Free first exhibition") : "—"}
          icon={Calendar}
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium">Plan usage (live — this is what Phase 20C's backend checks actually enforce)</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          {usage.map((u) => {
            const overLimit = u.limit !== null && u.currentUsage >= u.limit;
            return (
              <div key={u.resource}>
                <p className="text-muted-foreground text-xs">{USAGE_RESOURCE_LABEL[u.resource] ?? u.resource}</p>
                <p className={overLimit ? "text-destructive font-medium" : ""}>
                  {u.currentUsage.toLocaleString("en-IN")} / {u.limit === null ? "Unlimited" : u.limit.toLocaleString("en-IN")}
                  {overLimit && " (over limit)"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium">Period</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Current period start</p>
            <p>{subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Current period end</p>
            <p>{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—"}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Created {new Date(subscription.createdAt).toLocaleString()} · Updated {new Date(subscription.updatedAt).toLocaleString()}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium">Actions</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={plan.id}
            onValueChange={(planId) => changePlan.mutate({ organizerId, planId }, { onError })}
            disabled={subscription.status === "cancelled" || subscription.status === "expired"}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={subscription.status !== "trialing" || activate.isPending}
            onClick={() => activate.mutate({ organizerId }, { onError })}
          >
            Activate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={subscription.status !== "active" || cancel.isPending}
            onClick={() => setConfirmAction("cancel")}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={(subscription.status !== "trialing" && subscription.status !== "active") || expire.isPending}
            onClick={() => setConfirmAction("expire")}
          >
            Expire
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction === "cancel" ? "Cancel this subscription?" : "Expire this subscription?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "cancel"
                ? "This will cancel the organizer's current subscription. This cannot be undone — cancelled subscriptions cannot be reactivated."
                : "This marks the subscription as expired, immediately blocking any plan-limited actions for this organizer. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmAction === "cancel" ? cancel : expire;
                action.mutate({ organizerId }, { onError, onSuccess: () => toast.success(`Subscription ${confirmAction === "cancel" ? "cancelled" : "expired"}`) });
                setConfirmAction(null);
              }}
            >
              {confirmAction === "cancel" ? "Cancel Subscription" : "Expire Subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
