import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, ExternalLink, MapPin, RotateCcw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import ShareEventLinks from "@/components/organizer/ShareEventLinks";
import { useArchiveEvent, useEvent, useEventModules, usePublishEvent, useRestoreEvent, useUpdateEvent } from "@/hooks/useEvents";

const MODULE_LABELS: Record<string, string> = {
  REGISTRATION: "Registration",
  TICKETING: "Ticketing",
  EXHIBITORS: "Exhibitors",
  STALL_BOOKING: "Stall booking",
  FLOOR_PLAN: "Floor plan",
  CHECK_IN: "Check-in",
  LEADS: "Lead capture",
  SPEAKERS: "Speakers",
  SESSIONS: "Sessions",
  SPONSORS: "Sponsors",
  PARTNERS: "Partners",
  VENDORS: "Vendors",
  PARTICIPANTS: "Participants",
  ANALYTICS: "Analytics",
  VOLUNTEERS: "Volunteers",
  SEATING: "Seating",
};

export default function UniversalEventOverview() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canUpdate = hasOrganizerPermission(user?.roles, "event:update");
  const canDelete = hasOrganizerPermission(user?.roles, "event:delete");
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const modulesQuery = useEventModules(id);

  const publishEvent = usePublishEvent();
  const updateEvent = useUpdateEvent();
  const archiveEvent = useArchiveEvent();
  const restoreEvent = useRestoreEvent();

  const changeLifecycle = (status: "PAUSED" | "COMPLETED" | "CANCELLED") => {
    const labels = { PAUSED: "pause", COMPLETED: "complete", CANCELLED: "cancel" };
    if (!window.confirm(`Are you sure you want to ${labels[status]} this event?`)) return;
    updateEvent.mutate({ id: event?.id ?? "", data: { status } }, {
      onError: (error) => toast.error(error instanceof Error ? error.message : `Failed to ${labels[status]} event`),
    });
  };

  if (isLoading) return <LoadingState label="Loading event..." />;
  if (isError || !event) {
    return <ErrorState title="Event not found" description="This event could not be loaded." onRetry={() => refetch()} />;
  }

  if (event.exhibition) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="This event is managed as an exhibition"
          description="Use the exhibition workspace for its operational workflows."
        />
        <Button asChild variant="outline">
          <Link to={`/organizer/exhibitions/${event.exhibition.id}`}>Open exhibition workspace</Link>
        </Button>
      </div>
    );
  }

  const enabledModules = (modulesQuery.data ?? []).filter((module) => module.enabled);
  const participantModules = new Set(["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS"]);
  const participantsEnabled = enabledModules.some((module) => participantModules.has(module.moduleType));


  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/organizer/events" aria-label="Back to events"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold truncate">{event.title}</h1>
            <Badge variant="secondary">{event.eventType}</Badge>
            <Badge>{event.status}</Badge>
            {event.archivedAt && <Badge variant="destructive">Archived</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Universal Event workspace</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!event.archivedAt && event.status !== "DRAFT" && <ShareEventLinks eventId={event.id} exhibitionId={event.exhibition?.id ?? null} />}
          {!event.archivedAt && <Button asChild variant="outline">
            <Link to={`/organizer/events/${event.id}/edit`}>Edit event <ExternalLink className="ml-2 h-4 w-4" /></Link>
          </Button>}
          {canDelete && !event.archivedAt && <Button variant="ghost" className="text-destructive" onClick={() => {
            if (!window.confirm("Archive this event? It will be removed from active event lists and public discovery until restored.")) return;
            archiveEvent.mutate(event.id, {
              onSuccess: () => toast.success("Event archived"),
              onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to archive event"),
            });
          }} disabled={archiveEvent.isPending}><Trash2 className="mr-2 h-4 w-4" />Archive</Button>}
          {canDelete && event.archivedAt && <Button variant="outline" onClick={() => {
            if (!window.confirm("Restore this event? If it is published and public, it may become publicly visible again.")) return;
            restoreEvent.mutate(event.id, {
              onSuccess: () => toast.success("Event restored"),
              onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to restore event"),
            });
          }} disabled={restoreEvent.isPending}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex gap-3"><Calendar className="h-5 w-5 text-primary" /><div><p className="font-medium">Dates</p><p className="text-sm text-muted-foreground">{event.startDate ? new Date(event.startDate).toLocaleDateString() : "TBA"}{event.endDate ? ` – ${new Date(event.endDate).toLocaleDateString()}` : ""}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex gap-3"><MapPin className="h-5 w-5 text-primary" /><div><p className="font-medium">Location</p><p className="text-sm text-muted-foreground">{[event.venue, event.city].filter(Boolean).join(", ") || "TBA"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex gap-3"><Users className="h-5 w-5 text-primary" /><div><p className="font-medium">Participants</p><p className="text-sm text-muted-foreground">Use the participant workspace for event people.</p></div></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Enabled modules</CardTitle></CardHeader>
        <CardContent>
          {event.archivedAt ? <p className="text-sm text-muted-foreground">Module access is unavailable while this event is archived.</p> :
            modulesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading modules...</p> :
            modulesQuery.isError ? <p className="text-sm text-destructive">Could not load event modules.</p> :
            enabledModules.length === 0 ? <p className="text-sm text-muted-foreground">No optional modules are enabled yet.</p> :
            <div className="flex flex-wrap gap-2">{enabledModules.map((module) => <Badge key={module.moduleType} variant="secondary">{MODULE_LABELS[module.moduleType] ?? module.moduleType}</Badge>)}</div>}
        </CardContent>
      </Card>

      {!event.archivedAt && <div className="flex flex-wrap gap-3">
        {canUpdate && event.status !== "PUBLISHED" && event.status !== "CANCELLED" && event.status !== "COMPLETED" && (
          <Button
            onClick={() => publishEvent.mutate(event.id, { onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to publish event") })}
            disabled={publishEvent.isPending}
          >
            {publishEvent.isPending ? "Publishing..." : event.status === "PAUSED" ? "Resume / Publish" : "Publish"}
          </Button>
        )}
        {canUpdate && event.status === "PUBLISHED" && (
          <>
            <Button variant="outline" onClick={() => changeLifecycle("PAUSED")} disabled={updateEvent.isPending}>Pause</Button>
            <Button variant="outline" onClick={() => changeLifecycle("COMPLETED")} disabled={updateEvent.isPending}>Complete</Button>
            <Button variant="destructive" onClick={() => changeLifecycle("CANCELLED")} disabled={updateEvent.isPending}>Cancel</Button>
          </>
        )}
        {canUpdate && event.status === "PAUSED" && (
          <>
            <Button variant="outline" onClick={() => changeLifecycle("CANCELLED")} disabled={updateEvent.isPending}>Cancel</Button>
            <Button variant="outline" onClick={() => changeLifecycle("COMPLETED")} disabled={updateEvent.isPending}>Complete</Button>
          </>
        )}
        {enabledModules.some((module) => module.moduleType === "REGISTRATION") &&
          <Button asChild><Link to={`/event/${event.id}/register`}>Preview registration</Link></Button>}
        {enabledModules.some((module) => module.moduleType === "TICKETING") &&
          <Button asChild variant="outline"><Link to={`/event/${event.id}/tickets`}>Preview ticketing</Link></Button>}
        {participantsEnabled && <Button asChild variant="outline"><Link to={`/organizer/events/${event.id}/participants`}>Manage participants</Link></Button>}
      </div>}
      {event.archivedAt && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            This event is archived. Lifecycle controls, module changes, registration, ticketing and participant actions are unavailable until it is restored.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
