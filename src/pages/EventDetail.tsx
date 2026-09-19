import { Link, useParams } from "react-router-dom";
import { Calendar, MapPin, Building2, ArrowLeft, Ticket, Users, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicEvent } from "@/hooks/usePublicEvents";

function dateRange(start: string | null, end: string | null) {
  if (!start) return "Date to be announced";
  const a = new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  if (!end || new Date(start).toDateString() === new Date(end).toDateString()) return a;
  return `${a} – ${new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`;
}
const moduleLabels: Record<string,string> = { REGISTRATION:"Registration", TICKETING:"Tickets", EXHIBITORS:"Exhibitors", STALL_BOOKING:"Stall booking", FLOOR_PLAN:"Floor plan", CHECK_IN:"Check-in", LEADS:"Lead capture", SPEAKERS:"Speakers", SESSIONS:"Sessions", SPONSORS:"Sponsors", VENDORS:"Vendors", VOLUNTEERS:"Volunteers", SEATING:"Seating", ANALYTICS:"Analytics" };

export default function EventDetail() {
  const { id } = useParams<{id:string}>();
  const { data, isLoading, isError, refetch } = usePublicEvent(id);
  if (isLoading) return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-10 space-y-5"><Skeleton className="h-8 w-2/3"/><Skeleton className="aspect-[21/9] w-full"/><Skeleton className="h-32 w-full"/></main><Footer/></div>;
  if (isError || !data) return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-20"><ErrorState title="Event not found" description="This event may no longer be public." onRetry={() => refetch()}/></main><Footer/></div>;
  const { event } = data;
  const modules = event.moduleEnablements.map(m => moduleLabels[m.moduleType] ?? m.moduleType.replaceAll("_"," "));
  const isExhibition = Boolean(data.linkedExhibitionId);
  return <div className="min-h-screen bg-background"><Header/>
    <main>
      <section className="bg-secondary/30 py-3"><div className="container mx-auto px-4"><Link to="/events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4"/>All events</Link></div></section>
      <section className="container mx-auto px-4 py-8">
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-[21/9] bg-muted">{event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center"><Calendar className="w-12 h-12 text-muted-foreground/40"/></div>}</div>
          <div className="p-6 md:p-8">
            <div className="flex flex-wrap gap-2 mb-3"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{event.category?.name ?? event.eventType}</span></div>
            <h1 className="font-display text-3xl md:text-4xl font-bold">{event.title}</h1>
            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="flex gap-3"><Calendar className="w-5 h-5 text-primary shrink-0"/><div><p className="font-medium">When</p><p className="text-muted-foreground">{dateRange(event.startDate,event.endDate)}</p></div></div>
              <div className="flex gap-3"><MapPin className="w-5 h-5 text-primary shrink-0"/><div><p className="font-medium">Where</p><p className="text-muted-foreground">{event.venue ?? "Venue TBA"}{event.city ? `, ${event.city}` : ""}</p></div></div>
              <div className="flex gap-3"><Building2 className="w-5 h-5 text-primary shrink-0"/><div><p className="font-medium">Organized by</p><p className="text-muted-foreground">{event.organizer.name}</p></div></div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-8">
            <Card><CardHeader><CardTitle>About this event</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-muted-foreground leading-7">{event.description || "More event information will be available soon."}</p></CardContent></Card>
            {modules.length > 0 && <Card><CardHeader><CardTitle>What’s available</CardTitle></CardHeader><CardContent><div className="grid sm:grid-cols-2 gap-3">{modules.map(m=><div key={m} className="flex items-center gap-3 rounded-lg border p-3"><CheckCircle2 className="w-4 h-4 text-primary"/><span>{m}</span></div>)}</div></CardContent></Card>}
            <Card><CardHeader><CardTitle>Organizer</CardTitle></CardHeader><CardContent><div className="flex items-start gap-4">{event.organizer.logoUrl ? <img src={event.organizer.logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover"/> : <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center"><Building2 className="w-6 h-6"/></div>}<div><p className="font-semibold">{event.organizer.name}</p><p className="text-sm text-muted-foreground">{[event.organizer.city,event.organizer.state].filter(Boolean).join(", ")}</p>{event.organizer.slug && <Link className="text-sm text-primary hover:underline" to={`/organizers/${event.organizer.slug}`}>View organizer</Link>}</div></div></CardContent></Card>
          </div>
          <aside><Card className="sticky top-24"><CardHeader><CardTitle>Plan your visit</CardTitle></CardHeader><CardContent className="space-y-3">
            {event.moduleEnablements.some(m=>m.moduleType==="TICKETING") ? <Button className="w-full gap-2" asChild><Link to={`/event/${event.id}/tickets`}><Ticket className="w-4 h-4"/>View tickets</Link></Button> : null}
            {event.moduleEnablements.some(m=>m.moduleType==="REGISTRATION") && <Button variant="outline" asChild className="w-full gap-2"><Link to={`/event/${event.id}/register`}><Users className="w-4 h-4"/>Registration</Link></Button>}
            {isExhibition && <Button variant="ghost" asChild className="w-full"><Link to={`/exhibition/${data.linkedExhibitionId}`}>Open exhibition experience</Link></Button>}
            <p className="text-xs text-muted-foreground text-center">Event actions are enabled by the modules configured by the organizer.</p>
          </CardContent></Card></aside>
        </div>
      </section>
    </main><Footer/></div>;
}
