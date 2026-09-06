import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Repeat, Download, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatCurrency, formatActionLabel } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/csv";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import {
  usePlatformSubscriptions,
  usePlatformOrganizerSubscription,
  usePlatformOrganizerAudit,
  usePlatformOrganizers,
} from "@/hooks/platform/usePlatformAdmin";
import { SubscriptionPanel } from "@/components/platform/SubscriptionPanel";

const STATUS_OPTIONS = ["trialing", "active", "cancelled", "expired", "inactive"] as const;

/** The entitlement resource with the highest utilization against a real limit — the most useful single number to show in a table cell. Returns null when every resource is unlimited. */
function primaryUsage(usage: { resource: string; currentUsage: number; limit: number | null }[] | null) {
  if (!usage) return null;
  const withLimit = usage.filter((u) => u.limit !== null && u.limit > 0);
  if (withLimit.length === 0) return null;
  return withLimit.reduce((worst, u) => (u.currentUsage / (u.limit as number) > worst.currentUsage / (worst.limit as number) ? u : worst));
}

const RESOURCE_LABEL: Record<string, string> = {
  exhibition: "exhibitions",
  exhibitor: "exhibitors",
  visitor: "visitors",
  stall: "stalls",
  team_member: "team members",
};

function billingCycleLabel(interval: string) {
  return { monthly: "Monthly", yearly: "Yearly", one_time: "One-time", custom: "Per event" }[interval] ?? interval;
}

function SubscriptionDetailDrawer({ organizerId, organizerName, onClose }: { organizerId: string; organizerName: string; onClose: () => void }) {
  const { data, isLoading } = usePlatformOrganizerSubscription(organizerId);
  const { data: auditLogs = [] } = usePlatformOrganizerAudit(organizerId);

  const subscriptionEvents = auditLogs.filter((log) => log.action.startsWith("subscription.") || log.action.startsWith("entitlement."));

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{organizerName}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-6">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/platform/organizers/${organizerId}`}>View organizer</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/platform/payments">View payment history</Link>
            </Button>
          </div>

          {isLoading ? <LoadingState label="Loading subscription..." /> : <SubscriptionPanel organizerId={organizerId} data={data} />}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-sm">Subscription History</h3>
            </div>
            {subscriptionEvents.length === 0 ? (
              <EmptyState title="No subscription events recorded yet" />
            ) : (
              <div className="divide-y divide-border">
                {subscriptionEvents.map((log) => (
                  <div key={log.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatActionLabel(log.action)}</p>
                      {log.actorUser && <p className="text-xs text-muted-foreground">by {log.actorUser.fullName ?? log.actorUser.email}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type QuickFilter = "all" | "trialing" | "active" | "expiringSoon" | "expired" | "cancelled";

export default function PlatformSubscriptions() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<QuickFilter>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [organizerFilter, setOrganizerFilter] = useState<string>("all");
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = usePlatformSubscriptions({
    search: search || undefined,
    status: filter !== "all" && filter !== "expiringSoon" ? filter : undefined,
    expiringSoon: filter === "expiringSoon",
  });
  const { data: allOrganizers = [] } = usePlatformOrganizers();

  const summary = data?.summary;
  const allRows = data?.subscriptions ?? [];

  const plans = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of allRows) {
      if (row.subscription) seen.set(row.subscription.plan.id, row.subscription.plan.name);
    }
    return Array.from(seen.entries());
  }, [allRows]);

  const rows = useMemo(
    () =>
      allRows
        .filter((r) => planFilter === "all" || r.subscription?.plan.id === planFilter)
        .filter((r) => organizerFilter === "all" || r.organizerId === organizerFilter),
    [allRows, planFilter, organizerFilter]
  );

  const totalSubscriptions = (summary?.active ?? 0) + (summary?.trialing ?? 0) + (summary?.expired ?? 0) + (summary?.cancelled ?? 0);

  const kpis: { key: QuickFilter | "total"; label: string; value: number | undefined }[] = [
    { key: "total", label: "Total Subscriptions", value: totalSubscriptions },
    { key: "active", label: "Active", value: summary?.active },
    { key: "trialing", label: "Trial", value: summary?.trialing },
    { key: "expiringSoon", label: "Expiring Soon", value: summary?.expiringSoon },
  ];
  const secondaryKpis = [
    { label: "Expired", value: summary?.expired ?? 0 },
    { label: "Cancelled", value: summary?.cancelled ?? 0 },
    { label: "MRR", value: formatCurrency(summary?.mrr ?? 0) },
  ];

  const hasActiveFilters = !!search || filter !== "all" || planFilter !== "all" || organizerFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setFilter("all");
    setPlanFilter("all");
    setOrganizerFilter("all");
  };

  const handleExport = () => {
    const csv = toCsv(
      rows.map((r) => {
        const sub = r.subscription;
        const usage = primaryUsage(r.usage);
        return {
          organizer: r.organizerName,
          plan: sub?.plan.name ?? "",
          status: sub?.status ?? "no plan",
          billingCycle: sub ? billingCycleLabel(sub.plan.billingInterval) : "",
          startDate: sub?.currentPeriodStart ?? sub?.createdAt ?? "",
          renewalOrExpiry: sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? "",
          usage: usage ? `${usage.currentUsage}/${usage.limit}` : "unlimited",
          amount: sub ? Number(sub.plan.price) : "",
          lastUpdated: sub?.updatedAt ?? "",
        };
      }),
      [
        { key: "organizer", label: "Organizer" },
        { key: "plan", label: "Plan" },
        { key: "status", label: "Status" },
        { key: "billingCycle", label: "Billing Cycle" },
        { key: "startDate", label: "Start Date" },
        { key: "renewalOrExpiry", label: "Renewal / Expiry" },
        { key: "usage", label: "Usage" },
        { key: "amount", label: "Amount" },
        { key: "lastUpdated", label: "Last Updated" },
      ]
    );
    downloadCsv("subscriptions.csv", csv);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <PlatformBreadcrumb page="Subscriptions" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-muted-foreground">Manage plans, subscription status, usage and entitlements across all organizers.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading subscriptions..." />
      ) : isError || !data ? (
        <ErrorState description="Couldn't load subscriptions." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <button
                key={kpi.key}
                onClick={() => kpi.key !== "total" && setFilter(filter === kpi.key ? "all" : (kpi.key as QuickFilter))}
                className={cn(
                  "bg-card border border-border rounded-lg p-3.5 text-left transition-colors",
                  kpi.key !== "total" && "hover:border-primary/40",
                  filter === kpi.key && "border-primary bg-primary/5"
                )}
              >
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-semibold mt-0.5">{kpi.value ?? 0}</p>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {secondaryKpis.map((kpi) => (
              <div key={kpi.label} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-sm font-semibold">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -my-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search subscriptions..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filter === "expiringSoon" ? "all" : filter} onValueChange={(v) => setFilter(v as QuickFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={organizerFilter} onValueChange={setOrganizerFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Organizer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizers</SelectItem>
                {allOrganizers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title={allRows.length === 0 ? "No subscriptions yet" : "No subscriptions match your current filters."}
              description={allRows.length === 0 ? "Subscriptions will appear here when organizers start using a plan." : undefined}
              action={
                hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                ) : allOrganizers.length > 0 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/platform/organizers">View Organizers</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Plan</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Usage</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Started</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Renews / Expires</th>
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => {
                    const sub = row.subscription;
                    const usage = primaryUsage(row.usage);
                    return (
                      <tr key={row.organizerId} className="hover:bg-secondary/30 transition-colors">
                        <td className="p-3">
                          <p className="font-medium text-sm">{row.organizerName}</p>
                          {sub && <p className="text-xs text-muted-foreground">{billingCycleLabel(sub.plan.billingInterval)}</p>}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {sub ? (sub.plan.code === "enterprise" ? `${sub.plan.name} (Custom)` : `${sub.plan.name} · ${formatCurrency(Number(sub.plan.price))}`) : "—"}
                        </td>
                        <td className="p-3">{sub ? <StatusBadge status={sub.status} /> : <span className="text-sm text-muted-foreground">No plan</span>}</td>
                        <td className="p-3 w-40">
                          {usage ? (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">
                                {usage.currentUsage.toLocaleString("en-IN")} / {usage.limit} {RESOURCE_LABEL[usage.resource] ?? usage.resource}
                              </p>
                              <Progress value={Math.min(100, (usage.currentUsage / (usage.limit as number)) * 100)} className="h-1.5" />
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unlimited</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {sub?.currentPeriodStart
                            ? new Date(sub.currentPeriodStart).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : sub
                              ? new Date(sub.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {sub?.currentPeriodEnd
                            ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                            : sub?.trialEndsAt
                              ? new Date(sub.trialEndsAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                        </td>
                        <td className="p-3">
                          <Button size="sm" variant="outline" onClick={() => setSelected({ id: row.organizerId, name: row.organizerName })}>
                            View <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selected && (
        <SubscriptionDetailDrawer organizerId={selected.id} organizerName={selected.name} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
