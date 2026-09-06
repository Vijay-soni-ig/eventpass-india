import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Share2, CalendarPlus, BadgeCheck, Calendar, MapPin, Clock, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FollowButton } from "@/components/organizer/FollowButton";
import { SaveButton } from "@/components/SaveButton";
import { downloadExhibitionIcs } from "@/lib/calendar";
import { formatEventDate, eventDurationDays } from "@/lib/dateFormat";
import type { Exhibition } from "@/types/exhibitor";

interface EventHeroProps {
  exhibition: Exhibition;
  eventPhaseLabel: string;
  isCompleted: boolean;
}

// Phase 24 — cover image w/ fallback (a muted block with no <img> at all
// when coverImageUrl is missing, never a broken-image icon), status/category
// badges, title, short description, organizer mini-strip, and the
// share/save/follow/add-to-calendar action row. Kept deliberately not-too-
// tall per the brief — no new copy or imagery beyond what already existed.
export function EventHero({ exhibition, eventPhaseLabel, isCompleted }: EventHeroProps) {
  // Some seeded/uploaded cover images 404 (the row has a URL but the file
  // behind it is missing) — matches the same real defect and fix already
  // applied to ExhibitionCard.tsx: fall back to the same muted/no-image
  // treatment rather than the browser's native broken-image icon.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!exhibition.coverImageUrl && !imgFailed;

  const duration = eventDurationDays(exhibition.startDate, exhibition.endDate);
  const dateLabel = exhibition.startDate
    ? exhibition.endDate && exhibition.endDate !== exhibition.startDate
      ? `${formatEventDate(exhibition.startDate)} – ${formatEventDate(exhibition.endDate)}`
      : formatEventDate(exhibition.startDate)
    : null;
  const locationLabel = [exhibition.venue, exhibition.city].filter(Boolean).join(", ");

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: exhibition.name, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl overflow-hidden">
        <div className="aspect-video relative bg-muted">
          {showImage ? (
            <img
              src={exhibition.coverImageUrl}
              alt={exhibition.name}
              className="w-full h-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-10 h-10 text-muted-foreground/40" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {exhibition.category && (
            <Link to={`/exhibitions?category=${encodeURIComponent(exhibition.category)}`}>
              <Badge variant="accent" className="hover:opacity-80">
                {exhibition.category}
              </Badge>
            </Link>
          )}
          <Badge variant={isCompleted ? "secondary" : "default"}>{eventPhaseLabel}</Badge>
        </div>

        <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2">{exhibition.name}</h1>
        {exhibition.description && (
          <p className="text-xl text-muted-foreground line-clamp-3">{exhibition.description}</p>
        )}

        {/* Immediately-scannable WHEN/WHERE — replaces the previous separate
            grid of small "Quick Facts" cards with one clear metadata line
            directly under the title, per the "don't scatter info into tiny
            cards" redesign direction. */}
        {(dateLabel || locationLabel || duration) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-foreground/80">
            {dateLabel && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                {dateLabel}
              </span>
            )}
            {locationLabel && (
              <span className="flex items-center gap-1.5 min-w-0">
                <MapPin className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span className="truncate">{locationLabel}</span>
              </span>
            )}
            {duration && duration > 1 && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                {duration} days
              </span>
            )}
          </div>
        )}

        {exhibition.organizer && (() => {
          const organizer = exhibition.organizer;
          const content = (
            <>
              <Avatar className="w-10 h-10 border border-border">
                <AvatarImage src={organizer.logoUrl ?? undefined} alt={organizer.name} />
                <AvatarFallback>{organizer.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs text-muted-foreground">Organized by</p>
                <p className="font-medium text-foreground group-hover:underline flex items-center gap-1">
                  {organizer.name}
                  {organizer.kycStatus === "verified" && (
                    <BadgeCheck className="w-4 h-4 text-success" aria-label="Verified Organizer" />
                  )}
                </p>
              </div>
            </>
          );
          // UI-02B: a slug-less organizer has no public profile page to link
          // to (`/organizers/` with an empty slug isn't a real destination) —
          // render the same strip as plain, non-interactive content instead
          // of a dead link, rather than assuming every organizer has a slug.
          return organizer.slug ? (
            <Link to={`/organizers/${organizer.slug}`} className="flex items-center gap-3 mt-4 w-fit group">
              {content}
            </Link>
          ) : (
            <div className="flex items-center gap-3 mt-4 w-fit">{content}</div>
          );
        })()}

        <div className="flex flex-wrap items-center gap-4 mt-6">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleShare}>
            <Share2 className="w-4 h-4" />
            Share
          </Button>
          {exhibition.startDate && !isCompleted && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => downloadExhibitionIcs(exhibition)}
            >
              <CalendarPlus className="w-4 h-4" />
              Add to Calendar
            </Button>
          )}
          <SaveButton exhibitionId={exhibition.id} />
          {exhibition.organizer && (
            <FollowButton organizerId={exhibition.organizer.id} slug={exhibition.organizer.slug ?? ""} />
          )}
        </div>
      </div>
    </div>
  );
}
