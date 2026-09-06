import { useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CityCardProps {
  city: string;
  /** Real value as it appears in exhibition data — used verbatim in the
   *  query param, same convention as every other city link in the app. */
  slug: string;
  count: number;
  /** A real exhibition photo from this city (the first live exhibition in
   *  it that has one) — never a stock/scraped image. `null` when no
   *  exhibition in this city has a cover image yet. */
  imageUrl: string | null;
}

// No city-image infrastructure exists anywhere in the app (no CMS field, no
// static asset mapping — confirmed by a repo-wide search before writing this
// component). Rather than invent one or reach for an external stock photo
// (both explicitly disallowed), the fallback is a branded, on-token visual:
// the same gradient used everywhere else for brand moments (gradient-hero)
// plus the city's own initial — never a generic broken-image icon, and
// nothing that claims to depict a place ExhibitTix hasn't actually
// photographed.
function CityImageFallback({ city }: { city: string }) {
  return (
    <div className="w-full h-full gradient-hero flex items-center justify-center" aria-hidden="true">
      <span className="font-display text-2xl font-bold text-primary-foreground/90">
        {city.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export function CityCard({ city, slug, count, imageUrl }: CityCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!imageUrl && !imgFailed;

  return (
    <Link
      to={`/exhibitions?city=${encodeURIComponent(slug)}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Explore exhibitions in ${city} — ${count} exhibition${count === 1 ? "" : "s"}`}
    >
      <Card className="card-premium overflow-hidden h-full">
        <div className="relative aspect-square overflow-hidden bg-muted">
          {showImage ? (
            <img
              src={imageUrl}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <CityImageFallback city={city} />
          )}

          {/* Details stay hidden until hover/focus — the image alone is the
              default state, per design direction. group-focus-within keeps
              this reachable via keyboard, and the Link's own aria-label
              carries the same info for anyone who can't hover at all
              (touch, screen readers). */}
          <div
            className="absolute inset-0 flex flex-col justify-end p-2.5 bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1 font-semibold text-background text-sm">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{city}</span>
            </div>
            <p className="text-xs text-background/80">
              {count} exhibition{count === 1 ? "" : "s"}
            </p>
            <p className="flex items-center gap-1 text-xs font-medium text-background mt-1">
              Explore
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

