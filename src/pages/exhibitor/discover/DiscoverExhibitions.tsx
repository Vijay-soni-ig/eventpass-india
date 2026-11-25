import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, MapPin, Search, Store, ArrowRight, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { usePublicEventCategories, usePublicEvents } from "@/hooks/usePublicEvents";

const PAGE_SIZE = 12;

function formatDate(value: string | null) {
  if (!value) return "Date to be announced";
  const dateOnly = value.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Date to be announced";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ExhibitionCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export default function DiscoverExhibitions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const city = searchParams.get("city") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const sort = (searchParams.get("sort") as "soonest" | "newest" | "title" | null) ?? "soonest";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchDraft, setSearchDraft] = useState(q);
  const [cityDraft, setCityDraft] = useState(city);

  useEffect(() => setSearchDraft(q), [q]);
  useEffect(() => setCityDraft(city), [city]);

  const categoriesQuery = usePublicEventCategories();
  const eventsQuery = usePublicEvents({
    exhibitorEligible: true,
    q: q || undefined,
    city: city || undefined,
    categoryId: categoryId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
    page,
    limit: PAGE_SIZE,
  });

  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateFilters = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    next.delete("page");
    setSearchParams(next);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateFilters({ q: searchDraft.trim(), city: cityDraft.trim() });
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Exhibitor workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Discover Events</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Find public events and exhibitions, review event information and apply to participate with your business.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/exhibitor-dashboard/participations" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            My Participations <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/exhibitor-dashboard/event-applications" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            Event Applications <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <form onSubmit={handleSearch} className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.55fr)_auto] sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search events..."
            aria-label="Search events"
            className="pl-9"
          />
        </div>
        <Input
          value={cityDraft}
          onChange={(event) => setCityDraft(event.target.value)}
          placeholder="City, e.g. Ahmedabad"
          aria-label="Filter by city"
        />
        <Button type="submit" className="w-full sm:w-auto">
          <Search className="mr-2 h-4 w-4" /> Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="discover-category" className="text-xs font-medium text-muted-foreground">Category</label>
          <Select value={categoryId || "all"} onValueChange={(value) => updateFilters({ categoryId: value === "all" ? "" : value })}>
            <SelectTrigger id="discover-category" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categoriesQuery.data?.categories ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="discover-date-from" className="text-xs font-medium text-muted-foreground">From date</label>
          <Input id="discover-date-from" type="date" value={dateFrom} onChange={(event) => updateFilters({ dateFrom: event.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="discover-date-to" className="text-xs font-medium text-muted-foreground">To date</label>
          <Input id="discover-date-to" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => updateFilters({ dateTo: event.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor="discover-sort" className="text-xs font-medium text-muted-foreground">Sort by</label>
          <Select value={sort} onValueChange={(value) => updateFilters({ sort: value })}>
            <SelectTrigger id="discover-sort" aria-label="Sort events">
              <SlidersHorizontal className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soonest">Upcoming first</SelectItem>
              <SelectItem value="newest">Recently published</SelectItem>
              <SelectItem value="title">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {eventsQuery.isLoading ? "Loading events..." : `${total} ${total === 1 ? "event" : "events"} found`}
        </p>
        {(q || city || categoryId || dateFrom || dateTo) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchDraft(""); setCityDraft(""); setSearchParams(new URLSearchParams()); }}>
            Clear filters
          </Button>
        )}
      </div>

      {eventsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <ExhibitionCardSkeleton key={index} />)}
        </div>
      ) : eventsQuery.isError ? (
        <ErrorState title="Couldn't load events" description="Your information has not been changed. Please retry." onRetry={() => void eventsQuery.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No eligible events found"
          description="Try another search or clear your filters. Only published events with exhibitor applications enabled or a linked exhibition are shown here."
          action={<Button variant="outline" onClick={() => { setSearchDraft(""); setCityDraft(""); setSearchParams(new URLSearchParams()); }}>Clear filters</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <Card key={event.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <Link to={`/exhibitor-dashboard/discover/${event.id}`} className="block" aria-label={`View ${event.title}`}>
                <div className="aspect-[16/9] overflow-hidden bg-muted">
                  {event.coverImageUrl ? (
                    <img src={event.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Store className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                </div>
              </Link>
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1">
                  {event.category && <p className="text-xs font-medium text-primary">{event.category.name}</p>}
                  <Link to={`/exhibitor-dashboard/discover/${event.id}`} className="line-clamp-2 font-semibold hover:text-primary">
                    {event.title}
                  </Link>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{event.description || "Event details will be updated by the organizer."}</p>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" />{formatDate(event.startDate)}{event.endDate && event.endDate !== event.startDate ? ` – ${formatDate(event.endDate)}` : ""}</p>
                  {(event.city || event.venue) && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{[event.venue, event.city].filter(Boolean).join(", ")}</span></p>}
                  <p className="truncate text-xs">Organized by {event.organizer.name}</p>
                </div>
                <Button asChild className="w-full" variant="outline">
                  <Link to={`/exhibitor-dashboard/discover/${event.id}`}>View event details <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!eventsQuery.isLoading && !eventsQuery.isError && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t pt-4">
          <Button variant="outline" disabled={page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set("page", String(page - 1)); setSearchParams(next); }}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(searchParams); next.set("page", String(page + 1)); setSearchParams(next); }}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
