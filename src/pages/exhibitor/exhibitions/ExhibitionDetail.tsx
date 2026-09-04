import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Users, Ticket, Store, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { useExhibition } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";

export default function ExhibitionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: exhibition, isLoading, isError } = useExhibition(id);
  const { data: attendeeBookings = [] } = useTicketBookings(id);

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isError || !exhibition) {
    return (
      <div className="text-center py-24 space-y-4">
        <Calendar className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
        <h2 className="text-xl font-semibold">Exhibition not found</h2>
        <p className="text-muted-foreground">
          This exhibition doesn't exist or you don't have access to it.
        </p>
        <Button onClick={() => navigate("/exhibitor-dashboard/exhibitions")}>Back to Exhibitions</Button>
      </div>
    );
  }

  const ticketTypes = exhibition.ticketTypes ?? [];
  const stalls = exhibition.stalls ?? [];
  const stallsOccupied = stalls.filter((s) => s.status === "sold").length;
  const ticketsSold = attendeeBookings.reduce((sum, b) => sum + b.quantity, 0);
  const ticketsTotal = ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
  const revenue = attendeeBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/exhibitor-dashboard/exhibitions">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{exhibition.name}</h1>
              <StatusBadge status={exhibition.status} />
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {exhibition.venue}, {exhibition.city}
              </span>
              {exhibition.startDate && exhibition.endDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(exhibition.startDate).toLocaleDateString()} -{" "}
                  {new Date(exhibition.endDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Revenue" value={formatCurrency(revenue)} icon={TrendingUp} />
        <StatCard
          title="Tickets Sold"
          value={`${ticketsSold} / ${ticketsTotal}`}
          change={ticketsTotal > 0 ? `${Math.round((ticketsSold / ticketsTotal) * 100)}% sold` : undefined}
          icon={Ticket}
        />
        <StatCard
          title="Stalls Booked"
          value={`${stallsOccupied} / ${stalls.length}`}
          change={stalls.length > 0 ? `${Math.round((stallsOccupied / stalls.length) * 100)}% occupied` : undefined}
          icon={Store}
        />
        <StatCard title="Registered" value={ticketsSold} icon={Users} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="stalls">Stalls</TabsTrigger>
          <TabsTrigger value="attendees">Attendees</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Ticket Type</th>
                  <th className="text-left p-4 text-sm font-medium">Price</th>
                  <th className="text-left p-4 text-sm font-medium">Sold</th>
                  <th className="text-left p-4 text-sm font-medium">Progress</th>
                  <th className="text-left p-4 text-sm font-medium">Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ticketTypes.map((ticket) => {
                  const sold = attendeeBookings
                    .filter((b) => b.ticketTypeId === ticket.id)
                    .reduce((sum, b) => sum + b.quantity, 0);
                  return (
                    <tr key={ticket.id} className="hover:bg-secondary/30">
                      <td className="p-4 font-medium">{ticket.name}</td>
                      <td className="p-4">{formatCurrency(Number(ticket.price))}</td>
                      <td className="p-4">
                        {sold} / {ticket.quantity}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Progress value={ticket.quantity > 0 ? (sold / ticket.quantity) * 100 : 0} className="w-24 h-2" />
                          <span className="text-sm text-muted-foreground">
                            {ticket.quantity > 0 ? Math.round((sold / ticket.quantity) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                      <td className="p-4">{Number(ticket.taxPercent)}%</td>
                    </tr>
                  );
                })}
                {ticketTypes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No ticket types yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="stalls" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stalls.map((stall) => (
              <div
                key={stall.id}
                className={`rounded-lg p-4 border-2 transition-colors ${
                  stall.status === "sold"
                    ? "bg-success/10 border-success/30"
                    : stall.status === "reserved"
                    ? "bg-warning/10 border-warning/30"
                    : "bg-card border-border hover:border-primary/50"
                }`}
              >
                <p className="font-mono font-semibold mb-1">{stall.code ?? stall.id.slice(0, 6)}</p>
                <p className="text-xs text-muted-foreground">{stall.stallType}</p>
                <p className="text-xs text-muted-foreground">{stall.size}</p>
                <StatusBadge status={stall.status} className="mt-2" />
                {stall.buyerName && <p className="text-xs mt-2 truncate">{stall.buyerName}</p>}
              </div>
            ))}
            {stalls.length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">No stalls configured yet.</div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="attendees" className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Name</th>
                  <th className="text-left p-4 text-sm font-medium">Email</th>
                  <th className="text-left p-4 text-sm font-medium">Ticket</th>
                  <th className="text-left p-4 text-sm font-medium">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attendeeBookings.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-secondary/30">
                    <td className="p-4 font-medium">{attendee.attendeeName ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{attendee.attendeeEmail ?? "—"}</td>
                    <td className="p-4">{attendee.ticketType?.name ?? "—"}</td>
                    <td className="p-4">
                      {attendee.checkInStatus ? (
                        <span className="text-success flex items-center gap-1">
                          ✓ {attendee.checkInTime ? new Date(attendee.checkInTime).toLocaleTimeString() : "Checked in"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not checked in</span>
                      )}
                    </td>
                  </tr>
                ))}
                {attendeeBookings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No attendees yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
