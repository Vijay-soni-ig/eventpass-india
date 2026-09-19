import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, ClipboardList, Ticket, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/apiClient";
import { useEvents } from "@/hooks/useEvents";

interface Analytics {
  event: { id: string; title: string; status: string; startDate: string | null; endDate: string | null; timezone: string };
  registrations: { total: number; confirmed: number; pending: number; cancelled: number };
  tickets: { total: number; active: number; used: number; cancelled: number; refunded: number; checkInRate: number };
  checkIns: { total: number };
  orders: { paid: number; refunded: number; grossPaid: number; refundedAmount: number; netTicketRevenue: number };
  ticketTypes: Array<{ id: string; name: string; capacity: number; price: number; status: string }>;
}

export default function EventAnalytics() {
  const { data, isLoading: eventsLoading } = useEvents({ page: 1, limit: 100 });
  const events = data?.events ?? [];
  const [eventId, setEventId] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!eventId && events.length) setEventId(events[0].id);
  }, [events, eventId]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<Analytics>(`/api/organizer/event-analytics/${eventId}`)
      .then((value) => { if (!cancelled) setAnalytics(value); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (eventsLoading) return <LoadingState label="Loading events..." />;
  if (!events.length) return <EmptyState icon={BarChart3} title="No events yet" description="Create and publish an event to see universal event analytics." />;
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Analytics</h1>
          <p className="text-muted-foreground">Registration, ticket, check-in and ticket-revenue performance for universal events.</p>
        </div>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select event" /></SelectTrigger>
          <SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {loading ? <LoadingState label="Loading event analytics..." /> : error || !analytics ? (
        <ErrorState title="Couldn't load event analytics" description="Please try again." onRetry={() => setEventId((id) => id)} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Registrations" value={analytics.registrations.confirmed} icon={Users} />
            <StatCard title="Tickets issued" value={analytics.tickets.total} icon={Ticket} />
            <StatCard title="Check-ins" value={analytics.checkIns.total} icon={CheckCircle2} />
            <StatCard title="Check-in rate" value={`${analytics.tickets.checkInRate}%`} icon={BarChart3} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard title="Gross ticket revenue" value={`₹${Number(analytics.orders.grossPaid).toLocaleString("en-IN")}`} icon={BarChart3} />
            <StatCard title="Refunded" value={`₹${Number(analytics.orders.refundedAmount).toLocaleString("en-IN")}`} icon={ClipboardList} />
            <StatCard title="Net ticket revenue" value={`₹${Number(analytics.orders.netTicketRevenue).toLocaleString("en-IN")}`} icon={BarChart3} />
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border"><h2 className="font-semibold">Ticket Types</h2></div>
            {analytics.ticketTypes.length ? <div className="overflow-x-auto"><table className="w-full"><thead className="bg-secondary/50"><tr><th className="text-left p-4 text-sm font-medium">Ticket type</th><th className="text-left p-4 text-sm font-medium">Capacity</th><th className="text-left p-4 text-sm font-medium">Price</th><th className="text-left p-4 text-sm font-medium">Status</th></tr></thead><tbody className="divide-y divide-border">{analytics.ticketTypes.map((type) => <tr key={type.id}><td className="p-4 font-medium">{type.name}</td><td className="p-4 text-muted-foreground">{type.capacity}</td><td className="p-4">₹{type.price.toLocaleString("en-IN")}</td><td className="p-4 text-muted-foreground">{type.status}</td></tr>)}</tbody></table></div> : <p className="p-6 text-center text-muted-foreground">No ticket types configured.</p>}
          </div>
        </>
      )}
    </div>
  );
}
