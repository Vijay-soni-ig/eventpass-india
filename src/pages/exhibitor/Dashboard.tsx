import { Link } from "react-router-dom";
import {
  Calendar,
  Ticket,
  Store,
  AlertCircle,
  ArrowRight,
  DollarSign,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBusiness } from "@/hooks/exhibitor/useBusiness";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useStallBookings } from "@/hooks/exhibitor/useBookings";

function profileCompleteness(business: ReturnType<typeof useBusiness>["data"]) {
  if (!business) return 0;
  const fields = [
    business.companyName,
    business.address,
    business.gst,
    business.pan,
    business.logoUrl,
    business.bankAccountNumber,
  ];
  const done = fields.filter(Boolean).length;
  return Math.round((done / fields.length) * 100);
}

export default function Dashboard() {
  const { data: business } = useBusiness();
  const { data: exhibitions = [] } = useExhibitions();
  const { data: ticketBookings = [] } = useTicketBookings();
  const { data: stallBookings = [] } = useStallBookings();

  const liveExhibitions = exhibitions.filter((e) => e.status === "live");
  const completeness = profileCompleteness(business);

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
      {/* Profile Warning Banner */}
      {completeness < 100 && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Complete your profile</p>
              <p className="text-xs text-muted-foreground">
                {completeness}% complete — finish to enable payouts
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
            <Link to="/exhibitor-dashboard/business/profile">Complete</Link>
          </Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Revenue" value={formatCurrency(totalRevenue)} icon={DollarSign} />
        <StatCard title="Tickets" value={ticketsSold.toLocaleString()} icon={Ticket} />
        <StatCard title="Stalls" value={stallsSold} icon={Store} />
        <StatCard title="Attendance" value={`${attendanceRate}%`} icon={Users} />
      </div>

      {/* Active Exhibitions */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Active Exhibitions</h2>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
            <Link to="/exhibitor-dashboard/exhibitions">
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>

        <div className="space-y-2">
          {liveExhibitions.length > 0 ? (
            liveExhibitions.map((exhibition) => (
              <Link
                key={exhibition.id}
                to={`/exhibitor-dashboard/exhibitions/${exhibition.id}`}
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
                  <p className="text-xs text-muted-foreground mt-1">
                    {exhibition._count?.ticketBookings ?? 0} sold
                  </p>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No live exhibitions</p>
              <Button asChild size="sm" className="mt-3 h-8">
                <Link to="/exhibitor-dashboard/exhibitions/new">Create Exhibition</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
