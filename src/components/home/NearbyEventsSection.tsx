import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Navigation, ArrowRight, Calendar, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveButton } from "@/components/SaveButton";
import { NearbyMap } from "@/components/home/NearbyMap";
import { useCity } from "@/hooks/useCityContext";
import { useDiscover } from "@/hooks/useDiscover";
import { getMinTicketPrice } from "@/components/ExhibitionCard";
import { CITY_CENTERS, NEARBY_RADIUS_OPTIONS, formatDistanceKm } from "@/lib/geo";
import { PRIMARY_CITIES } from "@/lib/discovery";
import type { Exhibition } from "@/types/exhibitor";

type GeoStatus = "idle" | "loading" | "success" | "denied" | "unavailable" | "timeout";

function formatDate(dateString: string | null) {
  if (!dateString) return "TBA";
  return new Date(dateString).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function NearbyCardImage({ exhibition }: { exhibition: Exhibition }) {
  const [failed, setFailed] = useState(false);
  const showImage = !!exhibition.coverImageUrl && !failed;
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
      {showImage ? (
        <img
          src={exhibition.coverImageUrl}
          alt={exhibition.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
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
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [manualCity, setManualCity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Priority 1: explicit "Use my location" success. Priority 2: the header's
  // own global city context. Priority 3: a city picked directly in this
  // section's own prompt (only shown when neither of the above exists —
  // never a competing permanent selector, see the prompt UI below).
  const effectiveCity = manualCity ?? city;
  const center = geoCoords ?? (effectiveCity ? CITY_CENTERS[effectiveCity] : null);
  const locationLabel = geoCoords ? "Near you" : effectiveCity;

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("success");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoStatus("denied");
        else if (err.code === err.POSITION_UNAVAILABLE) setGeoStatus("unavailable");
        else setGeoStatus("timeout");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const { data, isLoading, isError, refetch } = useDiscover(
    {
      type: "events",
      lat: center?.lat ?? 0,
      lng: center?.lng ?? 0,
      radiusKm,
      page: 1,
      limit: 9,
    },
    { enabled: !!center }
  );

  const items = useMemo(() => (center ? (data?.items as Exhibition[] | undefined) ?? [] : []), [data, center]);
  const total = center ? data?.total ?? 0 : 0;

  const mapItems = useMemo(
    () =>
      items
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((e) => ({ id: e.id, lat: e.latitude!, lng: e.longitude!, name: e.name, dateLabel: formatDate(e.startDate) })),
    [items]
  );

  return (
    <section className="container mx-auto px-4 py-10">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-2xl font-semibold">Events & Exhibitions Near You</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Discover what's happening around you.</p>
        </div>
        {center && total > 0 && (
          <Link to="/exhibitions" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0">
            View all nearby <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Location + radius controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {locationLabel && (
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
            {locationLabel}
          </span>
        )}

        <Select value={String(radiusKm)} onValueChange={(v) => setRadiusKm(Number(v))}>
          <SelectTrigger className="w-28 h-10" aria-label="Search radius">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NEARBY_RADIUS_OPTIONS.map((km) => (
              <SelectItem key={km} value={String(km)}>
                {km} km
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" className="gap-2 h-10" onClick={handleUseMyLocation} disabled={geoStatus === "loading"}>
          <Navigation className="w-4 h-4" aria-hidden="true" />
          {geoStatus === "loading" ? "Detecting location..." : "Use my location"}
        </Button>

        {geoStatus === "denied" && (
          <p className="text-sm text-muted-foreground w-full sm:w-auto" role="status">
            Location access was not allowed.{effectiveCity ? ` Showing events around ${effectiveCity} instead.` : ""}
          </p>
        )}
        {(geoStatus === "unavailable" || geoStatus === "timeout") && (
          <p className="text-sm text-muted-foreground w-full sm:w-auto" role="status">
            Couldn't detect your location.{effectiveCity ? ` Showing events around ${effectiveCity} instead.` : ""}
          </p>
        )}
      </div>

      {!center ? (
        // Neither geolocation nor a header city is set — the only honest
        // fallback is to ask, rather than silently defaulting to a place
        // the visitor never chose.
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground mb-3">Choose a city to see what's happening nearby.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PRIMARY_CITIES.filter((c) => CITY_CENTERS[c]).map((c) => (
              <Button key={c} variant="outline" size="sm" onClick={() => setManualCity(c)}>
                {c}
              </Button>
            ))}
          </div>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[420px] rounded-2xl" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-xl border border-border">
                <Skeleton className="w-24 h-24 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : isError ? (
        <ErrorState description="Unable to load nearby events." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No events or exhibitions found nearby"
          description="Try increasing your search radius or choosing another location."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {radiusKm < 100 && (
                <Button variant="outline" onClick={() => setRadiusKm(100)}>Increase Radius</Button>
              )}
              <Button asChild variant="outline">
                <Link to="/exhibitions">Explore All Exhibitions</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">
            {total} exhibition{total === 1 ? "" : "s"} nearby
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <NearbyMap
              className="h-[320px] lg:h-[480px] lg:col-span-2"
              items={mapItems}
              center={center}
              selectedId={selectedId}
              onSelect={setSelectedId}
              userLocation={geoCoords}
            />

            {/* Card list — remains the primary, fully usable way to browse
                nearby events without ever touching the map (see
                accessibility requirement: map is an enhancement, not a
                gate). */}
            <div className="space-y-3 lg:max-h-[480px] lg:overflow-y-auto lg:pr-1">
              {items.map((ex) => {
                const minPrice = getMinTicketPrice(ex);
                const isFree = minPrice === 0;
                const isSelected = ex.id === selectedId;
                return (
                  <Card
                    key={ex.id}
                    className={`overflow-hidden transition-colors cursor-pointer ${isSelected ? "border-primary ring-1 ring-primary" : "border-border/50"}`}
                    onClick={() => setSelectedId(ex.id)}
                  >
                    <CardContent className="p-3 flex gap-3">
                      <NearbyCardImage exhibition={ex} />
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/exhibition/${ex.id}`}
                            className="font-display text-sm font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {ex.name}
                          </Link>
                          <div onClick={(e) => e.stopPropagation()}>
                            <SaveButton exhibitionId={ex.id} iconOnly />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <Calendar className="w-3 h-3 shrink-0 text-primary" aria-hidden="true" />
                          {formatDate(ex.startDate)}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="truncate">
                            {ex.distanceKm != null ? formatDistanceKm(ex.distanceKm) : ex.city} · {ex.city}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-1.5">
                          <span className={isFree ? "text-xs font-semibold" : "text-xs font-semibold text-foreground"} style={isFree ? { color: "hsl(160, 72%, 36%)" } : undefined}>
                            {isFree ? "Free" : `₹${minPrice.toLocaleString("en-IN")}`}
                          </span>
                          <Link
                            to={`/exhibition/${ex.id}`}
                            className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Event <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
