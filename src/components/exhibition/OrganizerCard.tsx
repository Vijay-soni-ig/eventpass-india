import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Exhibition } from "@/types/exhibitor";

// Phase 24 — expanded organizer section. Deliberately uses ONLY the fields
// already present on `exhibition.organizer` (id/name/slug/logoUrl/kycStatus,
// per GET /api/public/exhibitions/:id) rather than firing a second request
// to the full public-organizer-profile endpoint for a description/event-
// count this component doesn't strictly need — "View Organizer" is exactly
// where that fuller profile (description, follower/event counts, gallery)
// already lives.
export function OrganizerCard({ organizer }: { organizer: NonNullable<Exhibition["organizer"]> }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-3">Organizer</h2>
      <div className="flex items-center gap-4">
        <Avatar className="w-14 h-14 border border-border">
          <AvatarImage src={organizer.logoUrl ?? undefined} alt={organizer.name} />
          <AvatarFallback>{organizer.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            {organizer.name}
            {organizer.kycStatus === "verified" && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-success">
                <BadgeCheck className="w-4 h-4" aria-hidden="true" />
                Verified
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">Event organizer on ExhibitTix</p>
        </div>
        {/* A slug-less organizer has no public profile page to link to
            (`/organizers/` with an empty slug isn't a real destination) —
            same guard EventHero's own organizer strip already applies. */}
        {organizer.slug && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/organizers/${organizer.slug}`}>View Organizer</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
