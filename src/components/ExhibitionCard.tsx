import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, ArrowRight, Heart, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Exhibition } from "@/types/exhibitor";

interface ExhibitionCardProps {
  exhibition: Exhibition;
  featured?: boolean;
  badgeType?: "Featured" | "Selling Fast" | "Trending" | "Editor's Pick";
}

const badgeStyles: Record<string, string> = {
  "Featured": "bg-primary text-primary-foreground",
  "Selling Fast": "bg-[hsl(15,80%,50%)] text-white",
  "Trending": "bg-[hsl(270,60%,50%)] text-white",
  "Editor's Pick": "bg-foreground text-background",
};

const getBadgeType = (exhibition: Exhibition, index?: number): string => {
  const types = ["Featured", "Trending", "Selling Fast", "Editor's Pick"];
  const hash = exhibition.id.charCodeAt(0) + (index || 0);
  return types[hash % types.length];
};

export function getMinTicketPrice(exhibition: Exhibition): number {
  const prices = (exhibition.ticketTypes ?? []).map((t) => Number(t.price));
  return prices.length ? Math.min(...prices) : 0;
}

const ExhibitionCard = ({ exhibition, badgeType }: ExhibitionCardProps) => {
  const [saved, setSaved] = useState(false);

  const badge = badgeType || getBadgeType(exhibition);
  const minPrice = getMinTicketPrice(exhibition);
  const isFree = minPrice === 0;
  const interested = Math.floor(20 + Math.random() * 80);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "TBA";
    const d = new Date(dateString);
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  return (
    <Card className="overflow-hidden group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50">
      {/* Image */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        {exhibition.coverImageUrl && (
          <img
            src={exhibition.coverImageUrl}
            alt={exhibition.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />

        {/* Badge top-left */}
        <span className={`absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full ${badgeStyles[badge] || badgeStyles["Featured"]}`}>
          {badge}
        </span>

        {/* Bookmark top-right */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSaved(!saved); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors"
        >
          <Heart className={`w-4 h-4 ${saved ? "fill-destructive text-destructive" : "text-foreground"}`} />
        </button>
      </div>

      <CardContent className="p-4">
        {/* Social proof */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-5 h-5 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                <Users className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{interested}+ Interested</span>
        </div>

        {/* Title */}
        <h3 className="font-display text-base font-semibold leading-snug line-clamp-2 mb-2 text-foreground group-hover:text-primary transition-colors">
          {exhibition.name}
        </h3>

        {/* Description - 1 line */}
        <p className="text-muted-foreground text-sm line-clamp-1 mb-3">
          {exhibition.description}
        </p>

        {/* Date */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1.5">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span>{formatDate(exhibition.startDate)}</span>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="truncate">{exhibition.venue}, {exhibition.city}</span>
        </div>

        {/* Price */}
        <div className="mb-3">
          {isFree ? (
            <span className="text-sm font-semibold" style={{ color: "hsl(160, 72%, 36%)" }}>Free</span>
          ) : (
            <span className="text-sm font-semibold text-foreground">₹{minPrice.toLocaleString("en-IN")} onwards</span>
          )}
        </div>

        {/* Book Now CTA */}
        <Link to={`/exhibition/${exhibition.id}`} className="block">
          <Button className="w-full min-h-[44px] gap-1.5 group/btn">
            Book Now
            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default ExhibitionCard;
