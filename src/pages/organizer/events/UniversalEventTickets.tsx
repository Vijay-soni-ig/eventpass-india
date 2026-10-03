import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Info, Pencil, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Switch } from "@/components/ui/switch";
import EventTicketTypeDialog from "@/components/events/EventTicketTypeDialog";
import { useAuth } from "@/hooks/useAuth";
import { useEvent, useEventModules } from "@/hooks/useEvents";
import { useArchiveEventTicketType, useEventTicketTypes, useUpdateEventTicketType, type OrganizerEventTicket } from "@/hooks/useEventTickets";
import { ApiError } from "@/lib/apiClient";
import { describeSaleWindow } from "@/lib/eventTicketForm";
import { hasOrganizerPermission } from "@/lib/permissions";

function formatPrice(price: string, currency: string) {
  const amount = Number(price);
  if (amount === 0) return "Free";
  return `${currency === "INR" ? "₹" : `${currency} `}${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** The one label that tells the organizer what visitors will see for this ticket right now. */
function ticketState(ticket: OrganizerEventTicket, now = new Date()): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (ticket.status === "ARCHIVED") return { label: "Archived", variant: "outline" };
  if (ticket.status === "INACTIVE") return { label: "Not available", variant: "secondary" };
  if (ticket.saleStartsAt && new Date(ticket.saleStartsAt) > now) return { label: "Scheduled", variant: "secondary" };
  if (ticket.saleEndsAt && new Date(ticket.saleEndsAt) <= now) return { label: "Sales ended", variant: "secondary" };
  if (ticket.remaining <= 0) return { label: "Sold out", variant: "destructive" };
  return { label: "On sale", variant: "default" };
}

export default function UniversalEventTickets() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "ticketType:manage");
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const modulesQuery = useEventModules(id);
  const ticketingEnabled = (modulesQuery.data ?? []).some((module) => module.moduleType === "TICKETING" && module.enabled);
  const modulesKnown = modulesQuery.isSuccess;

  const standalone = Boolean(event && !event.exhibition && !event.archivedAt);
  const ticketsQuery = useEventTicketTypes(id, canManage && standalone && ticketingEnabled);
  const updateTicket = useUpdateEventTicketType(id ?? "");
  const archiveTicket = useArchiveEventTicketType(id ?? "");

  const [editing, setEditing] = useState<OrganizerEventTicket | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<OrganizerEventTicket | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const tickets = useMemo(() => ticketsQuery.data ?? [], [ticketsQuery.data]);
  const archivedCount = tickets.filter((ticket) => ticket.status === "ARCHIVED").length;
  const visible = useMemo(() => tickets.filter((ticket) => showArchived || ticket.status !== "ARCHIVED"), [tickets, showArchived]);

  const back = (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" asChild>
        <Link to={`/organizer/events/${id}`} aria-label="Back to event"><ArrowLeft className="h-5 w-5" /></Link>
      </Button>
    </div>
  );

  if (isLoading) return <LoadingState label="Loading event..." />;
  if (isError || !event) return <ErrorState title="Event not found" description="This event could not be loaded." onRetry={() => refetch()} />;

  if (event.exhibition) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {back}
        <ErrorState title="Tickets for this event are managed in its exhibition workspace" description="Open the exhibition workspace to manage ticket types for this event." />
        <Button asChild variant="outline"><Link to={`/organizer/exhibitions/${event.exhibition.id}/tickets`}>Open exhibition tickets</Link></Button>
      </div>
    );
  }

  if (event.archivedAt) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {back}
        <ErrorState title="This event is archived" description="Restore the event to manage its tickets." />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {back}
        <ErrorState title="You don't have access to ticket management" description="Ask an owner or admin of your organization to change your role." />
      </div>
    );
  }

  const closed = event.status === "CANCELLED" || event.status === "COMPLETED";
  const canEdit = ticketingEnabled && !closed;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (ticket: OrganizerEventTicket) => {
    setEditing(ticket);
    setDialogOpen(true);
  };
  const setAvailable = (ticket: OrganizerEventTicket, available: boolean) => {
    updateTicket.mutate(
      { id: ticket.id, data: { status: available ? "ACTIVE" : "INACTIVE" } },
      {
        onSuccess: () => toast.success(available ? `"${ticket.name}" is available for sale` : `"${ticket.name}" is hidden from visitors`),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update the ticket"),
      },
    );
  };
  const confirmArchive = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    archiveTicket.mutate(target.id, {
      onSuccess: () => {
        toast.success(`"${target.name}" was archived`);
        setArchiveTarget(null);
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not archive the ticket");
        setArchiveTarget(null);
      },
    });
  };

  const listError = ticketsQuery.error instanceof ApiError ? ticketsQuery.error : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-slide-up">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/organizer/events/${event.id}`} aria-label="Back to event"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">Tickets</h1>
            <Badge>{event.status}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{event.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.status === "PUBLISHED" && (
            <Button asChild variant="outline">
              <Link to={`/event/${event.id}/tickets`}>View public tickets <ExternalLink className="ml-2 h-4 w-4" /></Link>
            </Button>
          )}
          {canEdit && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add ticket type</Button>}
        </div>
      </div>

      {closed && (
        <div role="status" className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>This event is {event.status === "CANCELLED" ? "cancelled" : "completed"}, so its tickets can no longer be changed.</p>
        </div>
      )}
      {!closed && event.status !== "PUBLISHED" && ticketingEnabled && (
        <div role="status" className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Visitors can't see or buy these tickets until the event is published.</p>
        </div>
      )}

      {modulesQuery.isLoading ? (
        <LoadingState label="Loading ticketing..." />
      ) : modulesQuery.isError ? (
        <ErrorState title="Couldn't load this event's modules" onRetry={() => modulesQuery.refetch()} />
      ) : modulesKnown && !ticketingEnabled ? (
        <EmptyState
          icon={Ticket}
          title="Ticketing is turned off for this event"
          description="Turn on the Ticketing module in the event settings to create ticket types."
          action={<Button asChild variant="outline"><Link to={`/organizer/events/${event.id}/edit`}>Open event settings</Link></Button>}
        />
      ) : ticketsQuery.isLoading ? (
        <LoadingState label="Loading ticket types..." />
      ) : ticketsQuery.isError ? (
        <ErrorState
          title={listError?.status === 404 ? "You can't manage tickets for this event" : listError?.status === 409 ? "Ticketing is turned off for this event" : "Couldn't load ticket types"}
          description={listError?.message}
          onRetry={listError?.status === 404 || listError?.status === 409 ? undefined : () => ticketsQuery.refetch()}
        />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No ticket types yet"
          description="Create the first ticket type so visitors can buy tickets once you publish the event."
          action={canEdit ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add ticket type</Button> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {archivedCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="show-archived-tickets" checked={showArchived} onCheckedChange={setShowArchived} />
              <Label htmlFor="show-archived-tickets">Show archived ({archivedCount})</Label>
            </div>
          )}
          <ul className="space-y-3" aria-label="Ticket types">
            {visible.map((ticket) => {
              const state = ticketState(ticket);
              const archived = ticket.status === "ARCHIVED";
              return (
                <li key={ticket.id}>
                  <Card className={archived ? "opacity-70" : undefined}>
                    <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{ticket.name}</h2>
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </div>
                        {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
                        <p className="text-sm text-muted-foreground">{describeSaleWindow(ticket.saleStartsAt, ticket.saleEndsAt)}</p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 lg:w-[26rem]">
                        <div><dt className="text-muted-foreground">Price</dt><dd className="font-medium">{formatPrice(ticket.price, ticket.currency)}</dd></div>
                        <div><dt className="text-muted-foreground">Capacity</dt><dd className="font-medium">{ticket.capacity.toLocaleString("en-IN")}</dd></div>
                        <div><dt className="text-muted-foreground">Sold</dt><dd className="font-medium">{ticket.sold.toLocaleString("en-IN")}{ticket.reserved > 0 ? ` (+${ticket.reserved} held)` : ""}</dd></div>
                        <div><dt className="text-muted-foreground">Remaining</dt><dd className="font-medium">{ticket.remaining.toLocaleString("en-IN")}</dd></div>
                      </dl>
                      {canEdit && !archived && (
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`ticket-available-${ticket.id}`}
                              checked={ticket.status === "ACTIVE"}
                              disabled={updateTicket.isPending}
                              onCheckedChange={(checked) => setAvailable(ticket, checked)}
                              aria-label={`Available for sale: ${ticket.name}`}
                            />
                            <Label htmlFor={`ticket-available-${ticket.id}`} className="text-sm">For sale</Label>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => openEdit(ticket)} aria-label={`Edit ${ticket.name}`}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setArchiveTarget(ticket)} aria-label={`Archive ${ticket.name}`}>Archive</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <EventTicketTypeDialog open={dialogOpen} onOpenChange={setDialogOpen} eventId={event.id} ticket={editing} />

      <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => !open && !archiveTicket.isPending && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{archiveTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Visitors will no longer see or buy this ticket. Tickets already sold stay valid and keep their records, but an archived ticket type cannot be edited or restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveTicket.isPending}>Keep ticket</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmArchive(); }} disabled={archiveTicket.isPending}>
              {archiveTicket.isPending ? "Archiving..." : "Archive ticket"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
