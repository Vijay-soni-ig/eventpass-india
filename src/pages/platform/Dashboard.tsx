import { useState } from "react";
import { DollarSign, Receipt, Calendar, Landmark, Store, Users } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { usePlatformDashboard } from "@/hooks/platform/usePlatformAdmin";
import { formatCurrencyCompact } from "@/lib/utils";
import { DateRangeControl, rangeForPreset, type DashboardRange } from "@/components/platform/dashboard/DateRangeControl";
import { KpiCard } from "@/components/platform/dashboard/KpiCard";
import { RevenueOverview } from "@/components/platform/dashboard/RevenueOverview";
import { PlatformActivity } from "@/components/platform/dashboard/PlatformActivity";
import { ExhibitionPerformance } from "@/components/platform/dashboard/ExhibitionPerformance";
import { TopExhibitionsTable } from "@/components/platform/dashboard/TopExhibitionsTable";
import { TopOrganizersTable } from "@/components/platform/dashboard/TopOrganizersTable";
import { SubscriptionHealth } from "@/components/platform/dashboard/SubscriptionHealth";
import { AttentionRequired } from "@/components/platform/dashboard/AttentionRequired";
import { RecentActivityFeed } from "@/components/platform/dashboard/RecentActivityFeed";
import { QuickActions } from "@/components/platform/dashboard/QuickActions";
import { PlatformHealth } from "@/components/platform/dashboard/PlatformHealth";
import { DashboardSkeleton } from "@/components/platform/dashboard/DashboardSkeleton";

export default function PlatformDashboard() {
  const [range, setRange] = useState<DashboardRange>(() => rangeForPreset("30d"));

  const { data, isLoading, isFetching, isError, refetch } = usePlatformDashboard({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    granularity: range.granularity,
  });

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Platform Dashboard</h1>
          <p className="text-muted-foreground">Cross-tenant overview of the entire ExhibitTix platform</p>
        </div>
        <DateRangeControl range={range} onChange={setRange} onRefresh={() => refetch()} isRefreshing={isFetching} />
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : isError || !data ? (
        <ErrorState description="Couldn't load platform metrics." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard
              label="Total Revenue"
              value={formatCurrencyCompact(data.kpis.revenue.current)}
              changePct={data.kpis.revenue.changePct}
              supporting="vs previous period"
              icon={DollarSign}
              href="/platform/payments"
            />
            <KpiCard
              label="Transactions"
              value={data.kpis.transactions.current.toLocaleString("en-IN")}
              changePct={data.kpis.transactions.changePct}
              supporting="vs previous period"
              icon={Receipt}
              href="/platform/payments"
            />
            <KpiCard
              label="Active Exhibitions"
              value={data.kpis.activeExhibitions.current.toLocaleString("en-IN")}
              supporting={`${data.kpis.activeExhibitions.startingSoon} starting soon`}
              icon={Calendar}
              href="/platform/exhibitions"
            />
            <KpiCard
              label="Organizers"
              value={data.kpis.organizers.total.toLocaleString("en-IN")}
              supporting={`${data.kpis.organizers.active} active`}
              icon={Landmark}
              href="/platform/organizers"
            />
            <KpiCard
              label="Exhibitors"
              value={data.kpis.exhibitors.total.toLocaleString("en-IN")}
              supporting={`+${data.kpis.exhibitors.newInPeriod} this period`}
              icon={Store}
              href="/platform/exhibitors"
            />
            <KpiCard
              label="Visitors"
              value={data.kpis.visitors.current.toLocaleString("en-IN")}
              changePct={data.kpis.visitors.changePct}
              supporting="vs previous period"
              icon={Users}
              href="/platform/visitors"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <RevenueOverview data={data.revenueSeries} />
            <PlatformActivity data={data.activityBreakdown} />
          </div>

          <ExhibitionPerformance breakdown={data.exhibitionBreakdown} />

          <TopExhibitionsTable exhibitions={data.topExhibitions} />

          <TopOrganizersTable organizers={data.topOrganizers} />

          <div className="grid lg:grid-cols-2 gap-4">
            <SubscriptionHealth summary={data.subscriptions} />
            <AttentionRequired items={data.attention} />
          </div>

          <RecentActivityFeed entries={data.recentActivity.slice(0, 10)} />

          <QuickActions />

          <PlatformHealth activeOrganizers={data.kpis.organizers.active} activeExhibitions={data.kpis.activeExhibitions.current} />
        </>
      )}
    </div>
  );
}
