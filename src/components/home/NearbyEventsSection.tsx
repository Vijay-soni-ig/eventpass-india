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
  // shared city context. Priority 3: a city chosen in this section when no
  // other location context exists.
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
        setManualCity(null);
        setSelectedId(null);
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

  const items = useMemo(
    () => (center ? (data?.items as Exhibition[] | undefined) ?? [] : []),
    [data, center]
  );
  const total = center ? data?.total ?? 0 : 0;

  const mapItems = useMemo(
    () =>
      items
        .filter((e) => e.latitude != null && e.longitude != null)
        .map((e) => ({
          id: e.id,
          lat: e.latitude!,
          lng: e.longitude!,
          name: e.name,
          dateLabel: formatDate(e.startDate),
        })),
    [items]
  );

  const selectCity = (selectedCity: string) => {
    setGeoCoords(null);
    setManualCity(selectedCity);
    setSelectedId(null);
    setGeoStatus("idle");
  };

  const hasLocation = !!center;
  const showCards = hasLocation && !isLoading && !isError && items.length > 0;

  return (
    <section className="container mx-auto px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-2xl font-semibold">Events & Exhibitions Near You</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Discover what's happening around you.</p>
        </div>
        {hasLocation && total > 0 && (
          <Link
            to="/exhibitions"
            className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            View all nearby <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>

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

        <Button
          variant="outline"
          className="gap-2 h-10"
          onClick={handleUseMyLocation}
          disabled={geoStatus === "loading"}
        >
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

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-[320px] lg:h-[480px] rounded-2xl" />
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
      ) : !hasLocation ? (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
          <NearbyMap
            className="h-[320px] sm:h-[380px] lg:h-[460px]"
            items={[]}
            center={null}
            selectedId={null}
            onSelect={() => undefined}
            userLocation={null}
          />
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className="max-w-xl w-full rounded-2xl border border-border/70 bg-background/95 shadow-lg p-6 text-center pointer-events-auto backdrop-blur-sm">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <p className="font-semibold text-base">Choose a city to see what's happening nearby.</p>
              <p className="text-sm text-muted-foreground mt-1.5 mb-4">
                Select a city or use your location to load nearby events on the map.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {PRIMARY_CITIES.filter((c) => CITY_CENTERS[c]).map((c) => (
                  <Button key={c} variant="outline" size="sm" onClick={() => selectCity(c)}>
                    {c}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : showCards ? (
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
                          <span
                            className={isFree ? "text-xs font-semibold" : "text-xs font-semibold text-foreground"}
                            style={isFree ? { color: "hsl(160, 72%, 36%)" } : undefined}
                          >
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
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="relative lg:col-span-2">
            <NearbyMap
              className="h-[320px] lg:h-[480px]"
              items={mapItems}
              center={center}
              selectedId={selectedId}
              onSelect={setSelectedId}
              userLocation={geoCoords}
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="rounded-xl border border-border/70 bg-background/95 shadow-sm p-5 text-center max-w-md backdrop-blur-sm pointer-events-auto">
                <MapPin className="w-5 h-5 text-primary mx-auto mb-2" aria-hidden="true" />
                <p className="font-medium">No events or exhibitions found nearby</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try increasing your search radius or choosing another location.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {radiusKm < 100 && (
                    <Button variant="outline" size="sm" onClick={() => setRadiusKm(100)}>
                      Increase Radius
                    </Button>
                  )}
                  <Button asChild variant="outline" size="sm">
                    <Link to="/exhibitions">Explore All Exhibitions</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card min-h-[320px] lg:h-[480px] flex items-center justify-center p-6 text-center">
            <EmptyState
              icon={MapPin}
              title="No nearby events"
              description="Try a larger search radius or another city."
            />
          </div>
        </div>
      )}
    </section>
  );
}
