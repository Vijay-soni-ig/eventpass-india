import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar, MapPin, QrCode, Ticket } from "lucide-react";
import { api } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type EventTicket = {
  id: string; eventTitle: string; eventStartDate: string | null; eventEndDate: string | null;
  venue: string | null; city: string | null; coverImageUrl: string | null; ticketTypeName: string;
  ticketCode: string; status: "ACTIVE" | "CANCELLED" | "REFUNDED" | "USED"; attendeeName: string;
};

export default function UniversalTicketsSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["event-tickets", "mine"],
    queryFn: () => api.get<{ tickets: EventTicket[] }>("/api/event-tickets/mine"),
  });
  const tickets = data?.tickets ?? [];
  if (isLoading) return <div className="space-y-4 mb-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
  if (isError || tickets.length === 0) return null;
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date TBA";
  return (
    <section className="mb-10" aria-labelledby="universal-tickets-heading">
      <div className="mb-4"><h2 id="universal-tickets-heading" className="font-display text-2xl font-semibold">Event Tickets</h2><p className="text-sm text-muted-foreground">Your tickets for universal events on ExhibitTix.</p></div>
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <Card key={ticket.id} className="overflow-hidden">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              {ticket.coverImageUrl ? <img src={ticket.coverImageUrl} alt="" aria-hidden="true" className="w-full sm:w-32 h-24 object-cover rounded-lg" /> : <div className="w-full sm:w-32 h-24 rounded-lg bg-muted flex items-center justify-center"><Ticket className="w-8 h-8 text-muted-foreground" /></div>}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium rounded-full bg-primary/10 text-primary px-2 py-1">{ticket.status}</span><span className="text-xs text-muted-foreground">{ticket.ticketCode}</span></div>
                <h3 className="font-semibold text-lg mt-2 truncate">{ticket.eventTitle}</h3>
                <div className="text-sm text-muted-foreground space-y-1 mt-1">
                  <p className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{formatDate(ticket.eventStartDate)} · {ticket.ticketTypeName}</p>
                  {(ticket.venue || ticket.city) && <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{[ticket.venue, ticket.city].filter(Boolean).join(", ")}</p>}
                </div>
              </div>
              {ticket.status === "ACTIVE" && <QrCode className="w-7 h-7 text-primary shrink-0" aria-hidden="true" />}
              <Button asChild size="sm"><Link to={"/my-tickets/event/" + ticket.id}>View Ticket</Link></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
