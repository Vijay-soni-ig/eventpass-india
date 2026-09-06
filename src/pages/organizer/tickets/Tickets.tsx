import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Ticket, Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings } from "@/hooks/exhibitor/useBookings";

export default function Tickets() {
  const { data: exhibitions = [], isLoading, isError, refetch } = useExhibitions();
  const { data: bookings = [] } = useTicketBookings();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  // Lets the event workspace's "Manage this exhibition" links deep-link here
  // pre-filtered (e.g. /organizer/tickets?exhibitionId=X).
  const [exhibitionFilter, setExhibitionFilter] = useState(searchParams.get("exhibitionId") ?? "all");

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  const allTickets = useMemo(
    () =>
      exhibitions.flatMap((exhibition) =>
        (exhibition.ticketTypes ?? []).map((ticket) => {
          const sold = bookings
            .filter((b) => b.ticketTypeId === ticket.id)
            .reduce((sum, b) => sum + b.quantity, 0);
          return { ...ticket, exhibitionId: exhibition.id, exhibitionName: exhibition.name, sold };
        })
      ),
    [exhibitions, bookings]
  );

  const filteredTickets = allTickets.filter((ticket) => {
    if (exhibitionFilter !== "all" && ticket.exhibitionId !== exhibitionFilter) return false;
    if (search && !ticket.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tickets</h1>
          <p className="text-muted-foreground">Ticket types across all your exhibitions</p>
        </div>
        <Button variant="outline" disabled title="Export not implemented yet">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={exhibitionFilter} onValueChange={setExhibitionFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Exhibition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Exhibitions</SelectItem>
            {exhibitions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading tickets..." />
      ) : isError ? (
        <ErrorState description="Couldn't load tickets." onRetry={() => refetch()} />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Ticket</th>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Price</th>
                <th className="text-left p-4 text-sm font-medium">Sold / Total</th>
                <th className="text-left p-4 text-sm font-medium">Progress</th>
                <th className="text-left p-4 text-sm font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTickets.map((ticket) => {
                const price = Number(ticket.price);
                const progress = ticket.quantity > 0 ? (ticket.sold / ticket.quantity) * 100 : 0;
                return (
                  <tr key={ticket.id} className="hover:bg-secondary/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Ticket className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <Link
                            to={`/organizer/exhibitions/${ticket.exhibitionId}`}
                            className="font-medium hover:text-primary"
                          >
                            {ticket.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{Number(ticket.taxPercent)}% tax</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{ticket.exhibitionName}</td>
                    <td className="p-4 font-medium">{formatCurrency(price)}</td>
                    <td className="p-4">
                      <span className="font-medium">{ticket.sold}</span>
                      <span className="text-muted-foreground"> / {ticket.quantity}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Progress value={progress} className="w-20 h-2" />
                        <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-primary">{formatCurrency(ticket.sold * price)}</td>
                  </tr>
                );
              })}
              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={Ticket}
                      title="No ticket types found"
                      description="Add ticket types from an exhibition's page."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
