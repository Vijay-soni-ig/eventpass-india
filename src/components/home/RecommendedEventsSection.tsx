import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/apiClient";
import { ExhibitionCard } from "@/components/ExhibitionCard";
import { useCity } from "@/hooks/useCityContext";
import type { Exhibition } from "@/types/exhibitor";

interface RecommendationResponse { items: Exhibition[]; personalized: boolean; reason: string | null; city: string | null; }

export function RecommendedEventsSection() {
  const { city } = useCity();
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false; setLoading(true);
    const query = city ? "?city=" + encodeURIComponent(city) + "&limit=4" : "?limit=4";
    api.get<RecommendationResponse>("/api/personalization/recommendations" + query).then((next) => { if (!cancelled) setData(next); }).catch(() => { if (!cancelled) setData(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city]);
  if (loading || !data?.items?.length) return null;
  const heading = data.personalized ? "Events you may like" : data.city ? "Recommended events near " + data.city : "Recommended for you";
  const subtitle = data.reason ? "Because of " + data.reason + "." : "Discover events selected from your interests and browsing context.";
  return (
    <section className="container mx-auto px-4 py-10" aria-labelledby="recommended-events-heading">
      <div className="flex items-end justify-between mb-5"><div>
        <h2 id="recommended-events-heading" className="font-display text-2xl font-semibold flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" aria-hidden="true" /> {heading}</h2>
        <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>
      </div><Link to="/exhibitions" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0 ml-4">View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">{data.items.map((event) => <div key={event.eventId ?? event.id} onClick={() => { if (event.eventId) void api.post("/api/personalization/interactions", { eventId: event.eventId, type: "CLICK", sessionId: getSessionId() }); }}><ExhibitionCard exhibition={event} /></div>)}</div>
    </section>
  );
}

function getSessionId(): string {
  const key = "exhibittix:personalization-session";
  try { const existing = window.localStorage.getItem(key); if (existing) return existing; const next = crypto.randomUUID(); window.localStorage.setItem(key, next); return next; }
  catch { return "session-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
}