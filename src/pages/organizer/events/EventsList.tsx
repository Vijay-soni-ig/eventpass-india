import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Filter, MapPin, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { useArchiveEvent, useEvents, useRestoreEvent } from "@/hooks/useEvents";

const EVENT_TYPES = [
  ["CONFERENCE", "Conference"], ["WORKSHOP", "Workshop"], ["SEMINAR", "Seminar"], ["CONCERT", "Concert"],
  ["FESTIVAL", "Festival"], ["SPORTS", "Sports"], ["COMMUNITY", "Community"], ["OTHER", "Other"],
] as const;

export default function EventsList() {
  const { user } = useAuth();
  const canCreate = hasOrganizerPermission(user?.roles, "event:create");
  const canDelete = hasOrganizerPermission(user?.roles, "event:delete");
  const [search, setSearch] = useState(""); const [eventType, setEventType] = useState("all");
  const [page, setPage] = useState(1); const [archived, setArchived] = useState(false);
  const { data, isLoading, isError, refetch } = useEvents({ search, eventType: eventType === "all" ? undefined : eventType, archived, page, limit: 20 });
  const archiveEvent = useArchiveEvent(); const restoreEvent = useRestoreEvent();
  const events = data?.events ?? [];

  const handleArchive = (id: string) => archiveEvent.mutate(id, {
    onSuccess: () => toast.success("Event archived"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to archive event"),
  });
  const handleRestore = (id: string) => restoreEvent.mutate(id, {
    onSuccess: () => toast.success("Event restored"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to restore event"),
  });

  return <div className="space-y-6 animate-slide-up">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold">Events</h1><p className="text-muted-foreground">Create and manage every event your organization runs.</p></div>
      {canCreate && <Button asChild><Link to="/organizer/events/new"><Plus className="mr-2 h-4 w-4" />Create Event</Link></Button>}
    </div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search events..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      <Select value={eventType} onValueChange={(value) => { setEventType(value); setPage(1); }}>
        <SelectTrigger className="w-full sm:w-48"><Filter className="mr-2 h-4 w-4" /><SelectValue placeholder="Event type" /></SelectTrigger>
        <SelectContent><SelectItem value="all">All event types</SelectItem>{EVENT_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant={archived ? "default" : "outline"} onClick={() => { setArchived(!archived); setPage(1); }}>{archived ? "Showing archived" : "Show archived"}</Button>
    </div>
    {isLoading ? <LoadingState label="Loading events..." /> : isError ? <ErrorState description="Couldn't load your events." onRetry={() => refetch()} /> : events.length === 0 ? (
      <EmptyState icon={Calendar} title={archived ? "No archived events" : "No events found"}
        description={archived ? "Archived events will appear here." : "Create your first event. Exhibition creation remains available separately."}
        action={!archived && canCreate ? <Button asChild><Link to="/organizer/events/new">Create your first event</Link></Button> : undefined} />
    ) : <>
      <div className="grid gap-4">{events.map((event) => <div key={event.id} className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{event.title}</h2>
            <StatusBadge status={event.status.toLowerCase()} /><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{event.eventType}</span></div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {event.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.city}</span>}
              {event.startDate && <span>{new Date(event.startDate).toLocaleDateString()}</span>}
              {event.category && <span className="text-primary">{event.category.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {event.exhibition && <Button variant="outline" asChild><Link to={"/organizer/exhibitions/" + event.exhibition.id}>Open Exhibition</Link></Button>}
            {archived ? <Button variant="outline" onClick={() => handleRestore(event.id)} disabled={restoreEvent.isPending}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
              : <Button variant="ghost" className="text-destructive" onClick={() => handleArchive(event.id)} disabled={archiveEvent.isPending}><Trash2 className="mr-2 h-4 w-4" />Archive</Button>}
          </div>
        </div>
      </div>)}</div>
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Page {data?.page ?? page} · {data?.total ?? 0} events</p>
        <div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <Button variant="outline" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
      </div>
    </>}
  </div>;
}
