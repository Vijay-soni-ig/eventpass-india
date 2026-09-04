import { TrendingUp, Ticket, Store, Users, Calendar } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useStallBookings } from "@/hooks/exhibitor/useBookings";

export default function Analytics() {
  const { data: exhibitions = [] } = useExhibitions();
  const { data: ticketBookings = [] } = useTicketBookings();
  const { data: stallBookings = [] } = useStallBookings();

  const formatCurrency = (amount: number) => `₹${(amount / 100000).toFixed(1)}L`;

  const totalRevenue =
    ticketBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0) +
    stallBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const ticketsSold = ticketBookings.reduce((sum, b) => sum + b.quantity, 0);
  const stallsSold = stallBookings.length;
  const checkedIn = ticketBookings.filter((b) => b.checkInStatus).length;
  const attendanceRate = ticketsSold > 0 ? Math.round((checkedIn / ticketsSold) * 100) : 0;

  const perExhibition = exhibitions.map((exhibition) => {
    const tickets = ticketBookings.filter((b) => b.exhibitionId === exhibition.id);
    const stalls = stallBookings.filter((b) => b.exhibitionId === exhibition.id);
    const ticketsSoldForEx = tickets.reduce((sum, b) => sum + b.quantity, 0);
    const ticketsTotal = (exhibition.ticketTypes ?? []).reduce((sum, t) => sum + t.quantity, 0);
    const stallsTotal = exhibition.stalls?.length ?? 0;
    const revenue =
      tickets.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0) +
      stalls.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
    return {
      exhibition,
      ticketsSoldForEx,
      ticketsTotal,
      stallsSoldForEx: stalls.length,
      stallsTotal,
      revenue,
    };
  });

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">Performance insights across all exhibitions</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} />
        <StatCard title="Tickets Sold" value={ticketsSold.toLocaleString()} icon={Ticket} />
        <StatCard title="Stalls Sold" value={stallsSold} icon={Store} />
        <StatCard title="Attendance Rate" value={`${attendanceRate}%`} icon={Users} />
      </div>

      {/* Exhibition Performance */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Exhibition Performance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">City</th>
                <th className="text-left p-4 text-sm font-medium">Tickets</th>
                <th className="text-left p-4 text-sm font-medium">Stalls</th>
                <th className="text-left p-4 text-sm font-medium">Revenue</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {perExhibition.map(({ exhibition, ticketsSoldForEx, ticketsTotal, stallsSoldForEx, stallsTotal, revenue }) => (
                <tr key={exhibition.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">{exhibition.name}</td>
                  <td className="p-4 text-muted-foreground">{exhibition.city}</td>
                  <td className="p-4">
                    {ticketsSoldForEx} / {ticketsTotal}
                    {ticketsTotal > 0 && (
                      <span className="text-muted-foreground text-sm ml-2">
                        ({Math.round((ticketsSoldForEx / ticketsTotal) * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {stallsSoldForEx} / {stallsTotal}
                    {stallsTotal > 0 && (
                      <span className="text-muted-foreground text-sm ml-2">
                        ({Math.round((stallsSoldForEx / stallsTotal) * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-medium text-primary">{formatCurrency(revenue)}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                        exhibition.status === "live"
                          ? "bg-success/20 text-success"
                          : exhibition.status === "completed"
                          ? "bg-muted text-muted-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {exhibition.status}
                    </span>
                  </td>
                </tr>
              ))}
              {perExhibition.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No exhibitions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
