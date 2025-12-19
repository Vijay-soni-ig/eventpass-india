import { Link } from "react-router-dom";
import { Calendar, MapPin, Star, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Exhibition } from "@/data/exhibitions";

interface ExhibitionCardProps {
  exhibition: Exhibition;
  featured?: boolean;
}

const ExhibitionCard = ({ exhibition, featured = false }: ExhibitionCardProps) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <Card hover className={`overflow-hidden group ${featured ? "md:flex" : ""}`}>
      <div className={`relative overflow-hidden ${featured ? "md:w-2/5" : "aspect-[4/3]"}`}>
        <img
          src={exhibition.images[0]}
          alt={exhibition.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
        <Badge variant="accent" className="absolute top-4 left-4">
          {exhibition.category}
        </Badge>
        {featured && (
          <Badge variant="success" className="absolute top-4 right-4">
            Featured
          </Badge>
        )}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-2 text-card">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">
              {formatDate(exhibition.startDate)} - {formatDate(exhibition.endDate)}
            </span>
          </div>
        </div>
      </div>

      <CardContent className={`p-5 ${featured ? "md:w-3/5 md:flex md:flex-col md:justify-center" : ""}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="font-display text-lg leading-tight line-clamp-2">
            {exhibition.title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-4 h-4 fill-accent text-accent" />
            <span className="text-sm font-semibold">{exhibition.rating}</span>
          </div>
        </div>

        <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
          {exhibition.description}
        </p>

        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
          <MapPin className="w-4 h-4 shrink-0" />
          <span className="truncate">{exhibition.venue}, {exhibition.city}</span>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div>
            <span className="text-muted-foreground text-sm">From</span>
            <p className="font-semibold text-lg text-foreground">
              ₹{exhibition.priceRange.min.toLocaleString("en-IN")}
            </p>
          </div>
          <Link to={`/exhibition/${exhibition.id}`}>
            <Button size="sm" className="group/btn">
              Book Now
              <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExhibitionCard;
