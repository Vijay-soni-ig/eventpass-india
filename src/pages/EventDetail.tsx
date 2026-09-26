import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, CheckCircle2, ExternalLink, Link2, MapPin, Share2, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicEvent, usePublicEventParticipants, usePublicEventTickets } from "@/hooks/usePublicEvents";
import { getPublicEventPath } from "@/lib/publicUrls";

function dateRange(start: string | null, end: string | null) {
  if (!start) return "Date to be announced";
  const a = new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  if (!end || new Date(start).toDateString() === new Date(end).toDateString()) return a;
  return `${a} – ${new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`;
}
const moduleLabels: Record<string, string> = { REGISTRATION: "Registration", TICKETING: "Tickets", EXHIBITORS: "Exhibitors", STALL_BOOKING: "Stall booking", FLOOR_PLAN: "Floor plan", CHECK_IN: "Check-in", LEADS: "Lead capture", SPEAKERS: "Speakers", SESSIONS: "Sessions", SPONSORS: "Sponsors", VENDORS: "Vendors", VOLUNTEERS: "Volunteers", SEATING: "Seating", ANALYTICS: "Analytics", PARTICIPANTS: "Participants" };
const participantLabels: Record<string, string> = { SPEAKER: "Speakers", SPONSOR: "Sponsors", VENDOR: "Vendors", PARTNER: "Partners", STAFF: "Team", CUSTOM: "Participants" };

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");
  const { data, isLoading, isError, refetch } = usePublicEvent(id);
  const participantsEnabled = Boolean(data?.event.moduleEnablements.some(m => m.moduleType === "PARTICIPANTS"));
  const ticketingEnabled = Boolean(data?.event.moduleEnablements.some(m => m.moduleType === "TICKETING"));
  const participantsQuery = usePublicEventParticipants(id, participantsEnabled);
  const isExhibition = Boolean(data?.linkedExhibitionId);
  const ticketsQuery = usePublicEventTickets(id, ticketingEnabled && !isExhibition);

  if (isLoading) return <div className="min-h-screen"><Header /><main className="container mx-auto px-4 py-10 space-y-5"><Skeleton className="h-8 w-2/3" /><Skeleton className="aspect-[21/9] w-full" /><Skeleton className="h-32 w-full" /></main><Footer /></div>;

  if (isError || !data) return <div className="min-h-screen"><Header /><main className="container mx-auto px-4 py-20"><ErrorState title="Event not found" description="This event may no longer be public." onRetry={() => refetch()} /></main><Footer /></div>;

  const { event } = data;
  const modules = event.moduleEnablements.map(m => moduleLabels[m.moduleType] ?? m.moduleType.replaceAll("_", " "));
  const participants = participantsQuery.data?.participants ?? [];
  const participantGroups = participants.reduce<Record<string, typeof participants>>((groups, participant) => {
    const key = participantLabels[participant.participantType] ?? "Participants";
    (groups[key] ??= []).push(participant);
    return groups;
  }, {});
  const availableTickets = ticketsQuery.data?.ticketTypes.filter(ticket => !ticket.soldOut) ?? [];
  const ticketPreview = availableTickets.slice(0, 3);
  const minTicket = ticketPreview.length ? Math.min(...ticketPreview.map(ticket => Number(ticket.price))) : null;
  const mapUrl = event.latitude != null && event.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`
    : null;

  const shareEvent = async () => {
    const shareData = { title: event.title, text: `Check out ${event.title}`, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareState("copied");
      }
    } catch {
      setShareState("idle");
    }
  };

  return <div className="min-h-screen bg-background"><Header />
    <main>
      <section className="bg-secondary/30 py-3"><div className="container mx-auto px-4 flex items-center justify-between gap-3">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" />All events</Link>
        <Button variant="ghost" size="sm" onClick={shareEvent} className="gap-2" aria-label="Share event"><Share2 className="w-4 h-4" />{shareState === "copied" ? "Link copied" : shareState === "shared" ? "Shared" : "Share"}</Button>
      </div></section>

      <section className="container mx-auto px-4 py-8">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-[21/9] bg-muted">{event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Calendar className="w-12 h-12 text-muted-foreground/40" /></div>}</div>
          <div className="p-6 md:p-8">
            <div className="flex flex-wrap gap-2 mb-3"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{event.category?.name ?? event.eventType}</span></div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">{event.title}</h1>
            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="flex gap-3"><Calendar className="w-5 h-5 text-primary shrink-0" /><div><p className="font-medium">When</p><p className="text-muted-foreground">{dateRange(event.startDate, event.endDate)}</p></div></div>
              <div className="flex gap-3"><MapPin className="w-5 h-5 text-primary shrink-0" /><div><p className="font-medium">Where</p><p className="text-muted-foreground">{event.venue ?? "Venue TBA"}{event.city ? `, ${event.city}` : ""}</p>{mapUrl && <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">Open map <ExternalLink className="w-3 h-3" /></a>}</div></div>
              <div className="flex gap-3"><Building2 className="w-5 h-5 text-primary shrink-0" /><div><p className="font-medium">Organized by</p><p className="text-muted-foreground">{event.organizer.name}</p></div></div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-8">
            <Card><CardHeader><CardTitle>About this event</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-muted-foreground leading-7">{event.description || "More event information will be available soon."}</p></CardContent></Card>

            {ticketingEnabled && !isExhibition && ticketsQuery.isLoading && <Card><CardHeader><CardTitle>Tickets</CardTitle></CardHeader><CardContent><div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div></CardContent></Card>}
            {ticketingEnabled && !isExhibition && !ticketsQuery.isLoading && !ticketsQuery.isError && ticketsQuery.data && <Card>
              <CardHeader><CardTitle>Tickets</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {ticketsQuery.data.ticketTypes.length === 0 ? <p className="text-sm text-muted-foreground">Ticket sales are not available yet.</p> : ticketPreview.length === 0 ? <p className="text-sm text-muted-foreground">All currently listed tickets are sold out.</p> : <>
                  <div className="grid sm:grid-cols-2 gap-3">{ticketPreview.map(ticket => <div key={ticket.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{ticket.name}</p>{ticket.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>}</div><span className="font-semibold whitespace-nowrap">{ticket.currency} {Number(ticket.price).toLocaleString("en-IN")}</span></div><p className="mt-3 text-xs text-muted-foreground">{ticket.remaining} remaining</p></div>)}</div>
                  {minTicket !== null && <p className="text-sm text-muted-foreground">Tickets from <span className="font-medium text-foreground">{ticketPreview[0].currency} {minTicket.toLocaleString("en-IN")}</span>.</p>}
                </>}
              </CardContent>
            </Card>}
            {modules.length > 0 && <Card><CardHeader><CardTitle>What’s available</CardTitle></CardHeader><CardContent><div className="grid sm:grid-cols-2 gap-3">{modules.map(m => <div key={m} className="flex items-center gap-3 rounded-lg border p-3"><CheckCircle2 className="w-4 h-4 text-primary" /><span>{m}</span></div>)}</div></CardContent></Card>}

            {participantsEnabled && participantsQuery.isLoading && <Card><CardHeader><CardTitle>Event participants</CardTitle></CardHeader><CardContent><div className="grid sm:grid-cols-2 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div></CardContent></Card>}
            {participantsEnabled && !participantsQuery.isLoading && participants.length > 0 && <Card><CardHeader><CardTitle>Event participants</CardTitle></CardHeader><CardContent className="space-y-7">{Object.entries(participantGroups).map(([group, items]) => <section key={group}><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3><div className="grid sm:grid-cols-2 gap-4">{items.map(participant => <Link key={participant.id} to={`${getPublicEventPath(event.id)}/participants/${participant.id}`} className="flex gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50">{participant.photoUrl ? <img src={participant.photoUrl} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0" /> : <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-muted-foreground" /></div>}<div className="min-w-0"><p className="font-semibold truncate">{participant.name}</p>{(participant.title || participant.organization) && <p className="text-sm text-muted-foreground">{[participant.title, participant.organization].filter(Boolean).join(" · ")}</p>}{participant.bio && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{participant.bio}</p>}</div></Link>)}</div></section>)}</CardContent></Card>}

            <Card><CardHeader><CardTitle>Organizer</CardTitle></CardHeader><CardContent><div className="flex items-start gap-4">{event.organizer.logoUrl ? <img src={event.organizer.logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover" /> : <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center"><Building2 className="w-6 h-6" /></div>}<div><p className="font-semibold">{event.organizer.name}</p><p className="text-sm text-muted-foreground">{[event.organizer.city, event.organizer.state].filter(Boolean).join(", ")}</p>{event.organizer.slug && <Link className="text-sm text-primary hover:underline" to={`/organizers/${event.organizer.slug}`}>View organizer</Link>}</div></div></CardContent></Card>
          </div>

          <aside><Card className="sticky top-24"><CardHeader><CardTitle>Plan your visit</CardTitle></CardHeader><CardContent className="space-y-3">
            {ticketingEnabled && <Button className="w-full gap-2" asChild><Link to={isExhibition ? `/exhibition/${data.linkedExhibitionId}` : `/event/${event.id}/tickets`}><Ticket className="w-4 h-4" />{isExhibition ? "View exhibition tickets" : availableTickets.length === 0 && !ticketsQuery.isLoading ? "View ticket options" : "View tickets"}</Link></Button>}
            {event.moduleEnablements.some(m => m.moduleType === "REGISTRATION") && <Button variant="outline" asChild className="w-full gap-2"><Link to={`/event/${event.id}/register`}><Users className="w-4 h-4" />Registration</Link></Button>}
            {isExhibition && !ticketingEnabled && <Button variant="ghost" asChild className="w-full"><Link to={`/exhibition/${data.linkedExhibitionId}`}>Open exhibition experience</Link></Button>}
            <Button variant="ghost" className="w-full gap-2" onClick={shareEvent}><Link2 className="w-4 h-4" />{shareState === "copied" ? "Link copied" : "Share event"}</Button>
            <p className="text-xs text-muted-foreground text-center">Availability is checked from the published event catalog.</p>
          </CardContent></Card></aside>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}
