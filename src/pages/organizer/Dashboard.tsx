import { Link } from "react-router-dom";
import { Calendar, Ticket, Store, ArrowRight, DollarSign, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useStallBookings } from "@/hooks/exhibitor/useBookings";

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const canCreate = hasOrganizerPermission(user?.roles, "exhibition:create");

  const { data: exhibitions = [], isLoading, isError, refetch } = useExhibitions();
  const { data: ticketBookings = [] } = useTicketBookings();
  const { data: stallBookings = [] } = useStallBookings();

  if (isLoading) return <LoadingState label="Loading your dashboard..." />;
  if (isError) return <ErrorState description="Couldn't load your exhibitions." onRetry={() => refetch()} />;

  const liveExhibitions = exhibitions.filter((e) => e.status === "live");
  const totalRevenue =
    ticketBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0) +
    stallBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const ticketsSold = ticketBookings.reduce((sum, b) => sum + b.quantity, 0);
  const stallsSold = stallBookings.length;
  const checkedIn = ticketBookings.filter((b) => b.checkInStatus).length;
  const attendanceRate = ticketsSold > 0 ? Math.round((checkedIn / ticketsSold) * 100) : 0;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Revenue" value={formatCurrency(totalRevenue)} icon={DollarSign} />
        <StatCard title="Tickets" value={ticketsSold.toLocaleString()} icon={Ticket} />
        <StatCard title="Stalls" value={stallsSold} icon={Store} />
        <StatCard title="Attendance" value={`${attendanceRate}%`} icon={Users} />
      </div>

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
