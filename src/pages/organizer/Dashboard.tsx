import { Link } from "react-router-dom";
import { Calendar, Ticket, Store, ArrowRight, DollarSign, Users, Plus, Building2, QrCode, Target, FileText, CreditCard, BarChart3 } from "lucide-react";
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

const QUICK_ACTIONS = [
  { label: "Create Exhibition", description: "Set up a new event", href: "/organizer/exhibitions/new", icon: Plus, permission: "exhibition:create" as const },
  { label: "Manage Exhibitors", description: "Applications and companies", href: "/organizer/exhibitors", icon: Building2, permission: "exhibitor:read" as const },
  { label: "Manage Tickets", description: "Ticket types and sales", href: "/organizer/tickets", icon: Ticket, permission: "ticket:read" as const },
  { label: "Check-in Scanner", description: "Scan visitor tickets", href: "/organizer/checkin", icon: QrCode, permission: "checkin:read" as const },
  { label: "Payments", description: "Review transactions", href: "/organizer/payments", icon: CreditCard, permission: "payment:read" as const },
  { label: "Analytics", description: "Track event performance", href: "/organizer/analytics", icon: BarChart3, permission: "analytics:read" as const },
];

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
  const visibleExhibitions = liveExhibitions.slice(0, 5);
  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  const availableQuickActions = QUICK_ACTIONS.filter((action) => {
    if (action.label === "Create Exhibition") return canCreate;
    return hasOrganizerPermission(user?.roles, action.permission);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizer Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage your exhibitions, sales, exhibitors, and visitors from one place.</p>
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

      <section aria-labelledby="quick-actions-heading" className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="quick-actions-heading" className="text-sm font-semibold">Quick actions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Jump directly into the workflows you use most.</p>
          </div>
        </div>
        {availableQuickActions.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {availableQuickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  to={action.href}
                  className="group rounded-lg border border-border/70 p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary/15">
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-medium leading-tight">{action.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{action.description}</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No dashboard actions are available for your current permissions.</p>
        )}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Exhibitions" value={`${metrics.activeExhibitions} / ${metrics.totalExhibitions}`} change="active / total" icon={Calendar} />
        <StatCard title="Exhibitors" value={`${metrics.confirmedExhibitors} / ${metrics.totalExhibitorsAllStatuses}`} change="confirmed / total" icon={Building2} />
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
          <StatCard title="Leads" value={metrics.totalLeads.toLocaleString()} change={`${Math.round((metrics.leadConversionRate ?? 0) * 100)}% converted`} icon={Target} />
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

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">Active Exhibitions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Your currently live events and ticket activity.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-primary self-start sm:self-auto">
            <Link to="/organizer/exhibitions">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>

        {visibleExhibitions.length > 0 ? (
          <div className="space-y-2">
            {visibleExhibitions.map((exhibition) => (
              <Link
                key={exhibition.id}
                to={`/organizer/exhibitions/${exhibition.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-transparent bg-muted/50 hover:bg-muted hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{exhibition.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {exhibition.city}
                      {exhibition.startDate ? ` • ${new Date(exhibition.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <StatusBadge status={exhibition.status} />
                  <p className="text-xs text-muted-foreground mt-1">{exhibition._count?.ticketBookings ?? 0} sold</p>
                </div>
              </Link>
            ))}
            {liveExhibitions.length > visibleExhibitions.length && (
              <Button asChild variant="outline" className="w-full mt-3">
                <Link to="/organizer/exhibitions">View {liveExhibitions.length - visibleExhibitions.length} more live exhibitions</Link>
              </Button>
            )}
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
