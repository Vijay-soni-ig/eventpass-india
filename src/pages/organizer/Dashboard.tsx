import { Link } from "react-router-dom";
import { Calendar, Ticket, Store, ArrowRight, DollarSign, Users, Plus, Building2, QrCode, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useOrganizerDashboardMetrics } from "@/hooks/organizer/useAnalytics";
import { PlanUsageCard } from "@/components/organizer/PlanUsageCard";

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const canCreate = hasOrganizerPermission(user?.roles, "exhibition:create");

  const { data: exhibitions = [], isLoading: exhibitionsLoading, isError: exhibitionsError, refetch: refetchExhibitions } = useExhibitions();
  const { data: metrics, isLoading: metricsLoading, isError: metricsError, refetch: refetchMetrics } = useOrganizerDashboardMetrics();

  if (exhibitionsLoading || metricsLoading) return <LoadingState label="Loading your dashboard..." />;
  if (exhibitionsError || metricsError || !metrics) {
    return <ErrorState description="Couldn't load your dashboard." onRetry={() => { refetchExhibitions(); refetchMetrics(); }} />;
  }

  const liveExhibitions = exhibitions.filter((e) => e.status === "live");
  const formatCurrency = (amount: number) => `₹${(amount / 100000).toFixed(1)}L`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organizer Dashboard</h1>
          <p className="text-muted-foreground">Overview across all exhibitions you organize</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/organizer/exhibitions/new">
              <Plus className="w-4 h-4 mr-2" />
              Create Exhibition
            </Link>
          </Button>
        )}
      </div>

      <PlanUsageCard />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Exhibitions" value={`${metrics.activeExhibitions} / ${metrics.totalExhibitions}`} change="active / total" icon={Calendar} />
        <StatCard
          title="Exhibitors"
          value={`${metrics.confirmedExhibitors} / ${metrics.totalExhibitorsAllStatuses}`}
          change="confirmed / total"
          icon={Building2}
        />
        <StatCard title="Stalls" value={`${metrics.occupiedStalls} / ${metrics.totalStalls}`} change="occupied / total" icon={Store} />
        <StatCard title="Visitors" value={metrics.totalVisitors.toLocaleString()} icon={Users} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Check-ins" value={metrics.totalCheckIns.toLocaleString()} icon={QrCode} />
        <StatCard title="Attendance Rate" value={`${Math.round(metrics.attendanceRate * 100)}%`} icon={Users} />
        {metrics.totalRevenue !== null ? (
          <StatCard title="Total Revenue" value={formatCurrency(metrics.totalRevenue)} icon={DollarSign} />
        ) : (
          <StatCard title="Total Revenue" value="—" change="No permission" icon={DollarSign} />
        )}
        {metrics.totalLeads !== null ? (
          <StatCard
            title="Leads"
            value={metrics.totalLeads}
            change={`${Math.round((metrics.leadConversionRate ?? 0) * 100)}% converted`}
            icon={Target}
          />
        ) : (
          <StatCard title="Leads" value="—" change="No permission" icon={Target} />
        )}
      </div>

      {metrics.totalRevenue !== null && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Ticket Revenue" value={formatCurrency(metrics.ticketRevenue ?? 0)} icon={Ticket} />
          <StatCard title="Stall Revenue" value={formatCurrency(metrics.stallRevenue ?? 0)} icon={Store} />
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Active Exhibitions</h2>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
            <Link to="/organizer/exhibitions">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>

        {liveExhibitions.length > 0 ? (
          <div className="space-y-2">
            {liveExhibitions.map((exhibition) => (
              <Link
                key={exhibition.id}
                to={`/organizer/exhibitions/${exhibition.id}`}
                className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">{exhibition.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {exhibition.city}
                      {exhibition.startDate ? ` • ${new Date(exhibition.startDate).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={exhibition.status} />
                  <p className="text-xs text-muted-foreground mt-1">{exhibition._count?.ticketBookings ?? 0} sold</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="No live exhibitions"
            description="Create an exhibition and publish it to see it here."
            action={
              canCreate ? (
                <Button asChild size="sm">
                  <Link to="/organizer/exhibitions/new">Create Exhibition</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
