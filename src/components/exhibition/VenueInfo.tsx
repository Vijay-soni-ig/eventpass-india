import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VenueMap } from "@/components/exhibition/VenueMap";

interface VenueInfoProps {
  venue: string | null;
  city: string | null;
  // Real venue coordinates (Exhibition.latitude/longitude — added for the
  // homepage's "Events Near You" nearby-search feature, reused here). Only
  // present when the organizer actually set them; no coordinates are ever
  // invented or geocoded client-side.
  latitude?: number | null;
  longitude?: number | null;
}

// Phase 24 — `venue`/`city` are the only always-present venue fields on
// Exhibition (no Venue model, no address/parking/transit/amenities columns
// anywhere in the schema — confirmed by audit); latitude/longitude were
// added later and remain optional. "View on Map" always uses Google's plain
// search-query URL format (no API key) as a reliable fallback; a real
// embedded map (Leaflet, already used elsewhere in the app) additionally
// renders when this specific exhibition has real coordinates.
export function VenueInfo({ venue, city, latitude, longitude }: VenueInfoProps) {
  if (!venue && !city) return null;
  const mapQuery = [venue, city].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
  const hasCoordinates = latitude != null && longitude != null;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3">Venue</h2>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <MapPin className="w-6 h-6 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          {venue && <h3 className="font-semibold text-foreground">{venue}</h3>}
          {city && <p className="text-muted-foreground text-sm">{city}</p>}
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" asChild>
            <a href={mapUrl} target="_blank" rel="noopener noreferrer">
              View on Map
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </Button>
          {hasCoordinates && <VenueMap lat={latitude!} lng={longitude!} label={venue || city || "Venue"} />}
        </div>
      </div>
    </div>
  );
}
