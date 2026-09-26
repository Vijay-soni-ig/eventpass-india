import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { api } from "@/lib/apiClient";
import ExhibitionCard from "@/components/ExhibitionCard";
import { useCity } from "@/hooks/useCityContext";
import { getPersonalizationSessionId, trackPersonalizationInteraction } from "@/hooks/usePersonalization";
import type { Exhibition } from "@/types/exhibitor";

interface RecommendationResponse { items: Exhibition[]; personalized: boolean; reason: string | null; city: string | null; }

export function RecommendedEventsSection() {
  const { city } = useCity();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams({ limit: "4" });
    if (city) query.set("city", city);
    query.set("sessionId", getPersonalizationSessionId());
    api.get<RecommendationResponse>("/api/personalization/recommendations?" + query.toString())
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city]);

  useEffect(() => {
    if (!data?.items?.length) return;
    data.items.forEach((event, position) => {
      if (!event.eventId) return;
      void trackPersonalizationInteraction({
        eventId: event.eventId,
        type: "RECOMMENDATION_IMPRESSION",
        metadata: { source: "recommendation", position: position + 1 },
      });
    });
  }, [data]);

  if (loading || !data?.items?.length) return null;

  const heading = data.personalized ? "Events you may like" : data.city ? "Recommended events near " + data.city : "Recommended for you";
  const subtitle = data.reason ? "Because of " + data.reason + "." : "Discover events selected from your interests and browsing context.";

  return (
    <section className="container mx-auto px-4 py-10" aria-labelledby="recommended-events-heading">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 id="recommended-events-heading" className="font-display text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" /> {heading}
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>
        </div>
        <Link to="/exhibitions" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0 ml-4">
          View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {data.items.map((event, position) => (
          <div key={event.eventId ?? event.id} className="min-w-0">
            <ExhibitionCard
              exhibition={event}
              onPrimaryClick={() => {
                if (event.eventId) void trackPersonalizationInteraction({
                  eventId: event.eventId,
                  type: "CLICK",
                  metadata: { source: "recommendation", position: position + 1 },
                });
              }}
            />
            <div className="flex justify-end gap-1 mt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                aria-label={"Not interested in " + event.name}
                onClick={() => {
                  if (event.eventId) void trackPersonalizationInteraction({
                    eventId: event.eventId,
                    type: "RECOMMENDATION_NOT_INTERESTED",
                    metadata: { source: "recommendation", position: position + 1 },
                  });
                  setData((current) => current ? { ...current, items: current.items.filter((item) => item.eventId !== event.eventId) } : current);
                }}
              >
                Not interested
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label={"Dismiss " + event.name}
                onClick={() => {
                  if (event.eventId) void trackPersonalizationInteraction({
                    eventId: event.eventId,
                    type: "RECOMMENDATION_DISMISS",
                    metadata: { source: "recommendation", position: position + 1 },
                  });
                  setData((current) => current ? { ...current, items: current.items.filter((item) => item.eventId !== event.eventId) } : current);
                }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
