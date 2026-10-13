import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganizerSubscriptions } from "@/hooks/organizer/useSubscription";

const RESOURCE_LABEL: Record<string, string> = {
  exhibition: "Active exhibitions",
  exhibitor: "Exhibitors",
  visitor: "Visitors",
  stall: "Stalls",
  team_member: "Team members",
};

const formatPrice = (price: string | number, currency: string) => {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return String(price);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₹${amount.toLocaleString("en-IN")}`;
  }
};

const statusLabel: Record<string, string> = {
  trialing: "Free first exhibition",
  active: "Active",
  cancelled: "Cancelled",
  expired: "Expired",
  inactive: "Inactive",
};

export default function OrganizerPlanManagement() {
  const { data: entries, isLoading, isError, error, refetch, isFetching } = useOrganizerSubscriptions();

  if (isLoading) return <LoadingState label="Loading your plan and usage…" />;

  if (isError) {
    const message = error instanceof Error ? error.message : "We couldn't load your plan details.";
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm"><Link to="/organizer"><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link></Button>
        <Card>
          <CardHeader>
            <CardTitle>Plan details unavailable</CardTitle>
            <CardDescription>{message}. If your role does not include billing access, ask your organizer owner or administrator to review the plan.</CardDescription>
          </CardHeader>
          <CardContent><Button onClick={() => void refetch()} disabled={isFetching}>Try again</Button></CardContent>
        </Card>
      </div>
    );
  }

  const entry = entries?.find((item) => item.subscription) ?? entries?.[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link to="/organizer"><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link></Button>
          <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review your current plan, monitor usage, and explore upgrade options for your event business.</p>
        </div>
        <Button asChild variant="outline"><Link to="/pricing">Compare all plans <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
      </div>

      {!entry ? (
        <Card>
          <CardHeader>
            <CardTitle>No organizer plan found</CardTitle>
            <CardDescription>We couldn't find a subscription for this workspace. No plan has been changed. Ask your platform administrator to review the workspace subscription.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild><Link to="/organizer-demo">Contact the ExhibitTix team <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{entry.subscription?.plan.name ?? "Plan not assigned"}</CardTitle>
                  <Badge variant={entry.subscription?.status === "active" ? "default" : "secondary"}>
                    {entry.subscription ? statusLabel[entry.subscription.status] ?? entry.subscription.status : "No subscription"}
                  </Badge>
                </div>
                <CardDescription>{entry.organizer.name} · Current workspace plan</CardDescription>
              </div>
              {entry.subscription && (
                <div className="sm:text-right">
                  <p className="text-2xl font-semibold">{formatPrice(entry.subscription.plan.price, entry.subscription.plan.currency)}</p>
                  <p className="text-xs text-muted-foreground">Plan price on record</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Subscription status</p>
                <p className="mt-1 font-medium">{entry.subscription ? statusLabel[entry.subscription.status] ?? entry.subscription.status : "Not assigned"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Billing period starts</p>
                <p className="mt-1 font-medium">{entry.subscription?.currentPeriodStart ? new Date(entry.subscription.currentPeriodStart).toLocaleDateString("en-IN") : "Not scheduled"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Billing period ends</p>
                <p className="mt-1 font-medium">{entry.subscription?.currentPeriodEnd ? new Date(entry.subscription.currentPeriodEnd).toLocaleDateString("en-IN") : "Not scheduled"}</p>
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="plan-usage-heading" className="space-y-3">
            <div>
              <h2 id="plan-usage-heading" className="text-lg font-semibold">Plan usage</h2>
              <p className="text-sm text-muted-foreground">Live usage against limits enforced by ExhibitTix.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {entry.usage.map((usage) => {
                const percentage = usage.limit === null || usage.limit <= 0 ? 0 : Math.min(100, usage.currentUsage / usage.limit * 100);
                const atLimit = usage.limit !== null && usage.currentUsage >= usage.limit;
                return (
                  <Card key={usage.resource}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-muted-foreground">{RESOURCE_LABEL[usage.resource] ?? usage.resource}</p>
                        <span className={atLimit ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
                          {usage.currentUsage.toLocaleString("en-IN")} / {usage.limit === null ? "Unlimited" : usage.limit.toLocaleString("en-IN")}
                        </span>
                      </div>
                      {usage.limit !== null && (
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${RESOURCE_LABEL[usage.resource] ?? usage.resource} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
                          <div className={`h-full rounded-full ${atLimit ? "bg-destructive" : "bg-primary"}`} style={{ width: `${percentage}%` }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {entry.trialConsumed && entry.subscription?.status === "trialing" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">Your free first exhibition has been used.</p>
              <p className="mt-1 text-muted-foreground">Review the available commercial plans and contact our team to discuss the right option for your next event.</p>
            </div>
          )}

          <section aria-labelledby="upgrade-options-heading" className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle id="upgrade-options-heading" className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Explore an upgrade</CardTitle>
                <CardDescription>Compare available plans, then ask our team to review the best fit for your event volume and operating needs.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row">
                <Button asChild><Link to="/pricing">View plans and pricing <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                <Button asChild variant="outline"><Link to="/organizer-demo">Request an upgrade review</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Billing transparency</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>You can review your current subscription and compare plans here. Your plan will not change just by viewing pricing.</p>
                <p>Self-service checkout is not enabled yet. Upgrade requests are reviewed by the ExhibitTix team; no payment is taken from this screen.</p>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
