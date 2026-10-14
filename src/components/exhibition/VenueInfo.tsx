import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VenueInfoProps {
  venue: string | null;
  city: string | null;
}

export function VenueInfo({ venue, city }: VenueInfoProps) {
  if (!venue && !city) return null;
  const mapQuery = [venue, city].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;

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
        </div>
      </div>
    </div>
  );
}
