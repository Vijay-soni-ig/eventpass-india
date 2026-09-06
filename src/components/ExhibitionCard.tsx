import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, ArrowRight, ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/SaveButton";
import type { Exhibition } from "@/types/exhibitor";

interface ExhibitionCardProps {
  exhibition: Exhibition;
  /** Set only by a caller that actually knows this card belongs to a
   *  meaningful group (e.g. the homepage's "Featured" section literally
   *  chose to feature it) — never derived from the card itself, so this
   *  never becomes fabricated per-card social proof. */
  badgeType?: "Featured" | "Editor's Pick";
  /** "list" = a compact horizontal row (image left, content right) for the
   *  Exhibition Listing page's List view. Same data/fields either way —
   *  only the arrangement changes. Defaults to the original vertical grid
   *  card. */
  layout?: "grid" | "list";
}

const badgeStyles: Record<string, string> = {
  "Featured": "bg-primary text-primary-foreground",
  "Editor's Pick": "bg-foreground text-background",
};

export function getMinTicketPrice(exhibition: Exhibition): number {
  const prices = (exhibition.ticketTypes ?? []).map((t) => Number(t.price));
  return prices.length ? Math.min(...prices) : 0;
}

function formatDate(dateString: string | null) {
  if (!dateString) return "TBA";
  const d = new Date(dateString);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const ExhibitionCard = ({ exhibition, badgeType, layout = "grid" }: ExhibitionCardProps) => {
  const minPrice = getMinTicketPrice(exhibition);
  const isFree = minPrice === 0;
  const detailPath = `/exhibition/${exhibition.id}`;
  // Some seeded/uploaded cover images 404 (the row has a URL but the file
  // behind it is missing) — a plain <img src> with no error handling shows
  // the browser's broken-image icon in that case. Track the failure and
  // fall back to the same placeholder used when there's no URL at all, so
  // a dead link never renders differently from "no image".
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!exhibition.coverImageUrl && !imgFailed;

  const priceNode = isFree ? (
    <span className="text-sm font-semibold" style={{ color: "hsl(160, 72%, 36%)" }}>Free</span>
  ) : (
    <span className="text-sm font-semibold text-foreground">₹{minPrice.toLocaleString("en-IN")} onwards</span>
  );

  const image = (
    <>
      {showImage ? (
        <img
          src={exhibition.coverImageUrl}
          alt={exhibition.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="w-8 h-8 text-muted-foreground/40" aria-hidden="true" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
      {badgeType && (
        <span className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyles[badgeType]}`}>
          {badgeType}
        </span>
      )}
    </>
  );

  if (layout === "list") {
    return (
      <Card className="overflow-hidden group transition-all duration-300 hover:shadow-lg border-border/50">
        <div className="flex flex-col sm:flex-row">
          <div className="relative aspect-video sm:aspect-[4/3] sm:w-56 shrink-0 overflow-hidden bg-muted">
            <Link to={detailPath} className="block w-full h-full">
              {image}
            </Link>
            <SaveButton exhibitionId={exhibition.id} iconOnly />
          </div>

          <CardContent className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <Link to={detailPath} className="block">
                <h3 className="font-display text-base font-semibold leading-snug line-clamp-1 mb-1 text-foreground group-hover:text-primary transition-colors">
                  {exhibition.name}
                </h3>
              </Link>
              <p className="text-muted-foreground text-sm line-clamp-1 mb-2">{exhibition.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {formatDate(exhibition.startDate)}
                </span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate">{exhibition.venue}, {exhibition.city}</span>
                </span>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0">
              {priceNode}
              <Link to={detailPath}>
                <Button size="sm" className="gap-1.5 min-h-[44px] group/btn">
                  Book Now
                  <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50">
      {/* Image — its own Link so the card's primary click target reaches
          the exhibition detail page, without nesting the SaveButton (a
          separate interactive control, positioned absolute against this
          same relative wrapper) inside that link. */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        <Link to={detailPath} className="block w-full h-full">
          {image}
        </Link>

        <SaveButton exhibitionId={exhibition.id} iconOnly />
      </div>

      <CardContent className="p-4">
        {/* Title */}
        <Link to={detailPath} className="block">
          <h3 className="font-display text-base font-semibold leading-snug line-clamp-2 mb-2 text-foreground group-hover:text-primary transition-colors">
            {exhibition.name}
          </h3>
        </Link>

        {/* Description - 1 line */}
        <p className="text-muted-foreground text-sm line-clamp-1 mb-3">
          {exhibition.description}
        </p>

        {/* Date */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{formatDate(exhibition.startDate)}</span>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{exhibition.venue}, {exhibition.city}</span>
        </div>

        {/* Price */}
        <div className="mb-3">{priceNode}</div>

        {/* Book Now CTA */}
        <Link to={detailPath} className="block">
          <Button className="w-full min-h-[44px] gap-1.5 group/btn">
            Book Now
            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" aria-hidden="true" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default ExhibitionCard;
