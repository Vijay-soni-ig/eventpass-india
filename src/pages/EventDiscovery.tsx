import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Calendar, MapPin, Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicEventCategories, usePublicEvents } from "@/hooks/usePublicEvents";
import { getPublicEventPath } from "@/lib/publicUrls";
import SeoHead from "@/components/SeoHead";
import StructuredData from "@/components/StructuredData";

const EVENT_TYPES = ["ALL", "CONFERENCE", "WORKSHOP", "SEMINAR", "CONCERT", "FESTIVAL", "SPORTS", "COMMUNITY", "OTHER"];

function dateLabel(value: string | null) {
  if (!value) return "Date TBA";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function EventDiscovery() {
  const [params, setParams] = useSearchParams();
  // 001E compatibility: legacy /exhibitions URLs used `search` and `category`.
  // Accept those aliases so existing homepage links and bookmarks keep working
  // while the Universal Event API remains the canonical read model.
  const q = params.get("q") ?? params.get("search") ?? "";
  const eventType = params.get("eventType") ?? "";
  const city = params.get("city") ?? "";
  const categoryId = params.get("categoryId") ?? params.get("category") ?? "";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const sort = (params.get("sort") as "soonest" | "newest" | "title" | null) ?? "soonest";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [cityDraft, setCityDraft] = useState(city);

  const categoriesQuery = usePublicEventCategories();
  const categories = categoriesQuery.data?.categories ?? [];
  // Keep the city box in step with the URL when filters are cleared or changed elsewhere.
  useEffect(() => setCityDraft(city), [city]);
  const query = usePublicEvents({ q: q || undefined, eventType: eventType || undefined, categoryId: categoryId || undefined, city: city || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, sort, page, limit: 20 });

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20));
  const typeLabel = useMemo(() => eventType ? eventType.charAt(0) + eventType.slice(1).toLowerCase() : "All events", [eventType]);
  const isSeoLanding = Boolean((eventType || city || categoryId) && !dateFrom && !dateTo && !q);
  const landingTitle = city && eventType
    ? `${eventType.charAt(0) + eventType.slice(1).toLowerCase()} events in ${city} | ExhibitTix`
    : city
      ? `Events in ${city} | ExhibitTix`
      : eventType
        ? `${eventType.charAt(0) + eventType.slice(1).toLowerCase()} events in India | ExhibitTix`
        : categoryId
          ? `Events by category | ExhibitTix`
          : "Discover Events | ExhibitTix";
  const landingDescription = city && eventType
    ? `Discover upcoming ${eventType.toLowerCase()} events in ${city} on ExhibitTix.`
    : city
      ? `Discover upcoming events in ${city} on ExhibitTix.`
      : eventType
        ? `Discover upcoming ${eventType.toLowerCase()} events across India on ExhibitTix.`
        : categoryId
          ? "Discover events by category on ExhibitTix."
          : "Discover conferences, workshops, festivals, concerts, exhibitions and community events across India.";
  const canonicalPath = isSeoLanding
    ? `/events?${new URLSearchParams(eventType ? { eventType, ...(city ? { city } : {}) } : city ? { city } : { categoryId }).toString()}`
    : "/events";

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    // Remove legacy aliases once the visitor changes a filter so the URL
    // converges on the Universal Event query contract.
    if (key === "q") next.delete("search");
    if (key === "categoryId") next.delete("category");
    next.delete("minPrice");
    next.delete("maxPrice");
    next.delete("page");
    setParams(next);
  };

  return <div className="min-h-screen bg-background">
    <SeoHead
      title={landingTitle}
      description={landingDescription.slice(0, 160)}
      canonicalUrl={canonicalPath}
      robots={isSeoLanding ? "index,follow" : "noindex,follow"}
      ogTitle={landingTitle}
      ogDescription={landingDescription.slice(0, 160)}
    />
    <StructuredData
      id="event-discovery-breadcrumb"
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://exhibittix.com/" },
          { "@type": "ListItem", position: 2, name: "Events", item: "https://exhibittix.com/events" },
        ],
      }}
    />
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
      <Card className="mb-6 border-border/70 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold text-base">Find your event</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Use the filters below to narrow your results.</p>
            </div>
            {(q || eventType || city || categoryId || dateFrom || dateTo || sort !== "soonest") && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); setCityDraft(""); setParams({}); }}>
                Clear filters
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-type-filter">Event type</label>
              <Select value={eventType || "ALL"} onValueChange={(value) => update("eventType", value === "ALL" ? "" : value)}>
                <SelectTrigger id="event-type-filter" className="w-full"><SelectValue placeholder="All event types" /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type === "ALL" ? "All event types" : type.charAt(0) + type.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-category-filter">Category</label>
              <Select value={categoryId || "all"} onValueChange={(value) => update("categoryId", value === "all" ? "" : value)}>
                <SelectTrigger id="event-category-filter" aria-label="Filter by category" className="w-full"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-city-filter">City</label>
              <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); update("city", cityDraft.trim()); }}>
                <Input id="event-city-filter" aria-label="Filter by city" value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} placeholder="Any city" className="min-w-0" maxLength={100} />
                <Button type="submit" variant="outline" size="icon" aria-label="Apply"><MapPin className="w-4 h-4" /></Button>
              </form>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-date-from">From date</label>
              <Input id="event-date-from" aria-label="Events from date" type="date" value={dateFrom} onChange={(e) => update("dateFrom", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-date-to">To date</label>
              <Input id="event-date-to" aria-label="Events to date" type="date" min={dateFrom || undefined} value={dateTo} onChange={(e) => update("dateTo", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="event-sort-filter">Sort by</label>
              <Select value={sort} onValueChange={(value) => update("sort", value)}>
                <SelectTrigger id="event-sort-filter" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="soonest">Soonest</SelectItem><SelectItem value="newest">Newest</SelectItem><SelectItem value="title">Event name</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{query.data?.total ?? 0} {typeLabel.toLowerCase()}</p>
      </div>

      {query.isLoading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">{Array.from({length:8}).map((_,i)=><div key={i} className="rounded-xl border overflow-hidden"><Skeleton className="aspect-video"/><div className="p-4 space-y-3"><Skeleton className="h-5 w-3/4"/><Skeleton className="h-4 w-1/2"/><Skeleton className="h-4 w-full"/></div></div>)}</div>
      : query.isError ? <ErrorState title="Couldn't load events" description="Please try again." onRetry={() => query.refetch()} />
      : query.data?.events.length === 0 ? <EmptyState icon={Calendar} title="No events found" description="Try a different search, city or event type." action={<Button variant="outline" onClick={() => { setSearch(""); setParams({}); }}>Clear filters</Button>} />
      : <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {query.data?.events.map(event => <Card key={event.id} className="overflow-hidden group hover:shadow-lg transition-shadow">
          <Link to={getPublicEventPath(event.id)} className="block">
            <div className="aspect-video bg-muted overflow-hidden">{event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async"/> : <div className="w-full h-full flex items-center justify-center"><Calendar className="w-8 h-8 text-muted-foreground/40"/></div>}</div>
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
