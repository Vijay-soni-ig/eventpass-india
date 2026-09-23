import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, MapPin, Search, ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicEventCategories, usePublicEvents } from "@/hooks/usePublicEvents";

const EVENT_TYPES = ["ALL", "CONFERENCE", "WORKSHOP", "SEMINAR", "CONCERT", "FESTIVAL", "SPORTS", "COMMUNITY", "OTHER"];

function dateLabel(value: string | null) {
  if (!value) return "Date TBA";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function EventDiscovery() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const eventType = params.get("eventType") ?? "";
  const city = params.get("city") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const sort = (params.get("sort") as "soonest" | "newest" | "title" | null) ?? "soonest";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);

  const categoriesQuery = usePublicEventCategories();
  const query = usePublicEvents({ q: q || undefined, eventType: eventType || undefined, categoryId: categoryId || undefined, city: city || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, sort, page, limit: 20 });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));
  const typeLabel = useMemo(() => eventType ? eventType.charAt(0) + eventType.slice(1).toLowerCase() : "All events", [eventType]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setParams(next);
  };

  return <div className="min-h-screen bg-background">
    <Header />
    <section className="gradient-hero py-12">
      <div className="container mx-auto px-4">
        <p className="text-primary-foreground/80 text-sm font-medium mb-2">Discover on ExhibitTix</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-3">Find events worth attending</h1>
        <p className="text-primary-foreground/80 max-w-2xl">Discover conferences, workshops, festivals, concerts, exhibitions and community events.</p>
        <form className="mt-7 flex flex-col sm:flex-row gap-3 max-w-3xl" onSubmit={(e) => { e.preventDefault(); update("q", search.trim()); }}>
          <Input aria-label="Search events" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, venues or cities..." className="h-12 bg-background" maxLength={200} />
          <Button type="submit" size="lg" className="h-12 gap-2"><Search className="w-4 h-4" />Search</Button>
        </form>
      </div>
    </section>

    <main className="container mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between mb-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Event type">
          {EVENT_TYPES.map((type) => <Button key={type} size="sm" variant={(type === "ALL" ? !eventType : eventType === type) ? "default" : "outline"} onClick={() => update("eventType", type === "ALL" ? "" : type)}>
            {type === "ALL" ? "All" : type.charAt(0) + type.slice(1).toLowerCase()}
          </Button>)}
        </div>
        <div className="flex gap-2">
          <Input aria-label="Filter by city" value={city} onChange={(e) => update("city", e.target.value.trim())} placeholder="City" className="w-40" />
          <Input aria-label="Events from date" type="date" value={dateFrom} onChange={(e) => update("dateFrom", e.target.value)} className="w-40" />\n          <Input aria-label="Events to date" type="date" value={dateTo} onChange={(e) => update("dateTo", e.target.value)} className="w-40" />\n          <select aria-label="Sort events" value={sort} onChange={(e) => update("sort", e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
            <option value="soonest">Soonest</option><option value="newest">Newest</option><option value="title">Title</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{query.data?.total ?? 0} {typeLabel.toLowerCase()}</p>
        <Link to="/exhibitions" className="text-sm text-primary hover:underline">Legacy exhibitions</Link>
      </div>

      {query.isLoading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">{Array.from({length:8}).map((_,i)=><div key={i} className="rounded-xl border overflow-hidden"><Skeleton className="aspect-video"/><div className="p-4 space-y-3"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-4 w-1/2"/><Skeleton className="h-4 w-full"/></div></div>)}</div>
      : query.isError ? <ErrorState title="Couldn't load events" description="Please try again." onRetry={() => query.refetch()} />
      : query.data?.events.length === 0 ? <EmptyState icon={Calendar} title="No events found" description="Try a different search, city or event type." action={<Button variant="outline" onClick={() => { setSearch(""); setParams({}); }}>Clear filters</Button>} />
      : <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {query.data?.events.map(event => <Card key={event.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
          <Link to={`/event/${event.id}`} className="block">
            <div className="aspect-video bg-muted overflow-hidden">{event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy"/> : <div className="w-full h-full flex items-center justify-center"><Calendar className="w-8 h-8 text-muted-foreground/40"/></div>}</div>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-primary mb-1">{event.category?.name ?? event.eventType}</p>
              <h2 className="font-semibold line-clamp-2 min-h-12 group-hover:text-primary">{event.title}</h2>
              <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <div className="flex gap-2"><Calendar className="w-4 h-4 shrink-0 text-primary"/><span>{dateLabel(event.startDate)}</span></div>
                <div className="flex gap-2"><MapPin className="w-4 h-4 shrink-0 text-primary"/><span className="truncate">{event.venue ?? "Venue TBA"}{event.city ? `, ${event.city}` : ""}</span></div>
              </div>
              <div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">{event.organizer.name}</span><span className="text-sm font-medium text-primary">View event <ArrowRight className="inline w-3 h-3"/></span></div>
            </CardContent>
          </Link>
        </Card>)}
      </div>}

      {totalPages > 1 && <div className="flex justify-center gap-3 mt-8"><Button variant="outline" disabled={page <= 1} onClick={() => { const n=new URLSearchParams(params); n.set("page", String(page-1)); setParams(n); }}>Previous</Button><span className="flex items-center text-sm text-muted-foreground">Page {page} of {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => { const n=new URLSearchParams(params); n.set("page", String(page+1)); setParams(n); }}>Next</Button></div>}
    </main>
    <Footer />
  </div>;
}
