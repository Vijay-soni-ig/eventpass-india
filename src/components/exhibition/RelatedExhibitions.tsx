import { Skeleton } from "@/components/ui/skeleton";
import ExhibitionCard from "@/components/ExhibitionCard";
import { useDiscover } from "@/hooks/useDiscover";
import type { DiscoverEventsResponse } from "@/types/discovery";

function RelatedCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

interface RelatedExhibitionsProps {
  currentExhibitionId: string;
  category: string | null;
  city: string | null;
}

// Phase 24 — reuses the existing public discovery/search endpoint
// (GET /api/public/discover?type=events) rather than a new "related events"
// endpoint. Falls back from category to city so an exhibition with no
// category still gets locally-relevant suggestions; excludes itself and only
// ever shows what /discover itself already restricts to (live, public —
// never draft/cancelled/private events).
export function RelatedExhibitions({ currentExhibitionId, category, city }: RelatedExhibitionsProps) {
  const { data, isLoading } = useDiscover({
    type: "events",
    category: category ?? undefined,
    city: !category ? city ?? undefined : undefined,
    page: 1,
    limit: 8,
  });

  if (isLoading) {
    return (
      <section>
        <h2 className="font-display text-2xl font-semibold mb-5">You May Also Like</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <RelatedCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  const items = ((data as DiscoverEventsResponse | undefined)?.items ?? [])
    .filter((e) => e.id !== currentExhibitionId)
    .slice(0, 4);

  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-5">You May Also Like</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map((exhibition) => (
          <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
        ))}
      </div>
    </section>
  );
}
