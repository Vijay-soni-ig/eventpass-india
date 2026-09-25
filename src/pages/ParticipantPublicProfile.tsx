import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, CalendarClock, ExternalLink, MapPin, Users } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { usePublicParticipantProfile, usePublicParticipantSessions } from "@/hooks/usePublicEvents";

const labels: Record<string, string> = {
  SPEAKER: "Speaker", SPONSOR: "Sponsor", VENDOR: "Vendor", PARTNER: "Partner", CUSTOM: "Participant",
};

function dateRange(start: string | null, end: string | null) {
  if (!start) return "Date to be announced";
  const a = new Date(start).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  if (!end || new Date(start).toDateString() === new Date(end).toDateString()) return a;
  return `${a} – ${new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`;
}

export default function ParticipantPublicProfile() {
  const { id, participantId } = useParams<{ id: string; participantId: string }>();
  const { data, isLoading, isError, refetch } = usePublicParticipantProfile(id, participantId);
  const isSpeaker = data?.participant.participantType === "SPEAKER";
  const { data: scheduleData, isLoading: scheduleLoading } = usePublicParticipantSessions(id, participantId, isSpeaker);

  if (isLoading) return <div className="min-h-screen"><Header /><main className="container mx-auto px-4 py-10 space-y-5"><Skeleton className="h-8 w-40" /><Skeleton className="h-56 w-full rounded-2xl" /><Skeleton className="h-48 w-full" /></main><Footer /></div>;

  if (isError || !data) return <div className="min-h-screen"><Header /><main className="container mx-auto px-4 py-20"><ErrorState title="Participant not found" description="This participant profile may no longer be public." onRetry={() => refetch()} /></main><Footer /></div>;

  const { event, participant, media } = data;
  const gallery = media.filter(item => item.kind === "GALLERY");
  const logo = media.find(item => item.kind === "LOGO");

  return <div className="min-h-screen bg-background"><Header />
    <main className="container mx-auto px-4 py-8 md:py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Button variant="ghost" asChild><Link to={`/event/${event.id}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to event</Link></Button>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{labels[participant.participantType] ?? participant.customType ?? "Participant"}</span>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="bg-secondary/30 px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {participant.photoUrl ? <img src={participant.photoUrl} alt={participant.name} className="h-28 w-28 rounded-2xl object-cover ring-1 ring-border" /> : <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-muted"><Users className="h-10 w-10 text-muted-foreground" /></div>}
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold md:text-4xl">{participant.name}</h1>
              {(participant.title || participant.organization) && <p className="mt-2 text-base text-muted-foreground">{[participant.title, participant.organization].filter(Boolean).join(" · ")}</p>}
              {participant.website && <a href={participant.website} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">Visit website <ExternalLink className="h-3 w-3" /></a>}
            </div>
            {logo && <img src={logo.fileUrl} alt={logo.altText || `${participant.name} logo`} className="ml-auto hidden h-20 max-w-40 object-contain sm:block" />}
          </div>
        </div>

        <div className="grid gap-8 p-6 md:grid-cols-[1fr_320px] md:p-10">
          <div className="space-y-8">
            <Card><CardHeader><CardTitle>About</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap leading-7 text-muted-foreground">{participant.bio || "Profile information will be available soon."}</p></CardContent></Card>
            {participant.participantType === "SPONSOR" && participant.sponsorProfile && (participant.sponsorProfile.package || participant.sponsorProfile.benefitsOverride?.length || participant.sponsorProfile.deliverablesOverride?.length) && <Card>
              <CardHeader><CardTitle>Sponsorship</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                {participant.sponsorProfile.package && <div className="rounded-xl border p-4" style={{ borderColor: participant.sponsorProfile.brandPrimaryColor || undefined }}>
                  <div className="flex items-start justify-between gap-4">
                    <div><h3 className="font-semibold">{participant.sponsorProfile.package.name}</h3>{participant.sponsorProfile.package.description && <p className="mt-1 text-sm text-muted-foreground">{participant.sponsorProfile.package.description}</p>}</div>
                    {participant.sponsorProfile.logoUrl && <img src={participant.sponsorProfile.logoUrl} alt={participant.name} className="h-12 max-w-28 object-contain" />}
                  </div>
                </div>}
                {((participant.sponsorProfile.benefitsOverride?.length ?? 0) > 0 || (participant.sponsorProfile.package?.benefits.length ?? 0) > 0) && <div><h3 className="mb-2 text-sm font-semibold">Benefits</h3><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{(participant.sponsorProfile.benefitsOverride?.length ? participant.sponsorProfile.benefitsOverride : participant.sponsorProfile.package?.benefits ?? []).map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                {((participant.sponsorProfile.deliverablesOverride?.length ?? 0) > 0 || (participant.sponsorProfile.package?.deliverables.length ?? 0) > 0) && <div><h3 className="mb-2 text-sm font-semibold">Deliverables</h3><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{(participant.sponsorProfile.deliverablesOverride?.length ? participant.sponsorProfile.deliverablesOverride : participant.sponsorProfile.package?.deliverables ?? []).map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                {participant.sponsorProfile.displayWebsite && <a href={participant.sponsorProfile.displayWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Sponsor website <ExternalLink className="h-3 w-3" /></a>}
              </CardContent>
            </Card>}
            {isSpeaker && <section><div className="mb-4 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Speaker schedule</h2></div>{scheduleLoading ? <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div> : scheduleData?.sessions.length ? <div className="space-y-3">{scheduleData.sessions.map(session => <Card key={session.id}><CardContent className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{session.title}</h3>{session.description && <p className="mt-1 text-sm text-muted-foreground">{session.description}</p>}<p className="mt-2 text-sm text-muted-foreground">{new Date(session.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {session.startTime}–{session.endTime} {session.timezone}</p></div>{session.room && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">{session.room}</span>}</div><div className="mt-3 flex flex-wrap gap-2">{session.speakers.map(speaker => <Link key={speaker.participant.id} to={`/event/${event.id}/participants/${speaker.participant.id}`} className="text-xs text-primary hover:underline">{speaker.participant.name} · {speaker.role.toLowerCase()}</Link>)}</div></CardContent></Card>)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground">No published sessions are scheduled for this speaker yet.</CardContent></Card>}</section>}
            {gallery.length > 0 && <section><h2 className="mb-4 text-xl font-semibold">Gallery</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{gallery.map(item => <figure key={item.id} className="overflow-hidden rounded-xl border bg-muted"><img src={item.fileUrl} alt={item.altText || participant.name} className="aspect-square w-full object-cover" />{item.caption && <figcaption className="p-2 text-xs text-muted-foreground">{item.caption}</figcaption>}</figure>)}</div></section>}
          </div>
          <aside><Card className="sticky top-24"><CardHeader><CardTitle>Event</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
            <div className="flex gap-3"><Calendar className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">{event.title}</p><p className="text-muted-foreground">{dateRange(event.startDate, event.endDate)}</p></div></div>
            <div className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-primary" /><p className="text-muted-foreground">{event.venue || "Venue TBA"}{event.city ? `, ${event.city}` : ""}</p></div>
            <div className="flex gap-3"><Building2 className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">{event.organizer.name}</p>{event.organizer.slug && <Link className="text-primary hover:underline" to={`/organizers/${event.organizer.slug}`}>View organizer</Link>}</div></div>
          </CardContent></Card></aside>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}
