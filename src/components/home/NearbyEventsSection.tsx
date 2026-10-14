import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Calendar, ImageOff } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveButton } from "@/components/SaveButton";
import { useCity } from "@/hooks/useCityContext";
import { useDiscover } from "@/hooks/useDiscover";
import { getMinTicketPrice } from "@/components/ExhibitionCard";
import { PRIMARY_CITIES } from "@/lib/discovery";
import type { Exhibition } from "@/types/exhibitor";

function formatDate(dateString: string | null) {
  if (!dateString) return "Date TBA";
  return new Date(dateString).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function EventCardImage({ exhibition }: { exhibition: Exhibition }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!exhibition.coverImageUrl && !failed;
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
      {showImage ? (
        <img src={exhibition.coverImageUrl!} alt={exhibition.name} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="w-6 h-6 text-muted-foreground/40" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export function NearbyEventsSection() {
  const { city } = useCity();
  const [selectedCity, setSelectedCity] = useState(city ?? "");

  useEffect(() => {
    if (city && !selectedCity) setSelectedCity(city);
  }, [city, selectedCity]);

  const { data, isLoading, isError, refetch } = useDiscover(
    { type: "events", city: selectedCity || undefined, page: 1, limit: 9, sort: "soonest" },
    { enabled: !!selectedCity },
  );
  const items = (data?.items as Exhibition[] | undefined) ?? [];
  const total = data?.total ?? items.length;

  return (
    <section className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-2xl font-semibold">Explore Events by City</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Find published events by their listed city. No precise location access is needed.</p>
        </div>
        <Link to={selectedCity ? `/exhibitions?city=${encodeURIComponent(selectedCity)}` : "/exhibitions"} className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0">
          View all events <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mb-5 max-w-xs">
        <label htmlFor="event-city-filter" className="text-sm font-medium block mb-1.5">City</label>
        <Select value={selectedCity || "all"} onValueChange={(value) => setSelectedCity(value === "all" ? "" : value)}>
          <SelectTrigger id="event-city-filter" className="w-full" aria-label="Filter events by city">
            <SelectValue placeholder="Choose a city" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Choose a city</SelectItem>
            {PRIMARY_CITIES.map((cityName) => <SelectItem key={cityName} value={cityName}>{cityName}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedCity ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <MapPin className="w-6 h-6 text-primary mx-auto mb-2" aria-hidden="true" />
          <p className="font-semibold">Choose a city to explore events</p>
          <p className="text-sm text-muted-foreground mt-1">Results use the city recorded by the organizer.</p>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex gap-3 p-3 rounded-xl border border-border"><Skeleton className="w-24 h-24 rounded-lg shrink-0" /><div className="flex-1 space-y-2 py-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-2/3" /></div></div>)}
        </div>
      ) : isError ? (
        <ErrorState description="Unable to load events for this city." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={MapPin} title={`No events listed in ${selectedCity}`} description="Try another city or explore all events." />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">{total} event{total === 1 ? "" : "s"} listed in {selectedCity}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((exhibition) => {
              const minPrice = getMinTicketPrice(exhibition);
              const isFree = minPrice === 0;
              return (
                <Card key={exhibition.id} className="overflow-hidden border-border/50">
                  <CardContent className="p-3 flex gap-3">
                    <EventCardImage exhibition={exhibition} />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/exhibition/${exhibition.id}`} className="font-display text-sm font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors">{exhibition.name}</Link>
                        <SaveButton exhibitionId={exhibition.id} iconOnly />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                        <Calendar className="w-3 h-3 shrink-0 text-primary" aria-hidden="true" />
                        {formatDate(exhibition.startDate)}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3 shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate">{exhibition.venue ? `${exhibition.venue} · ${exhibition.city}` : exhibition.city}</span>
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-2">
                        <span className={isFree ? "text-xs font-semibold text-success" : "text-xs font-semibold text-foreground"}>{isFree ? "Free" : `₹${minPrice.toLocaleString("en-IN")}`}</span>
                        <Link to={`/exhibition/${exhibition.id}`} className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5">View Event <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
