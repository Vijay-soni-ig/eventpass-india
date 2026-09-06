import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Calendar, MapPin, ArrowRight, Shield, Smartphone, QrCode, Tag, Building2, CalendarClock, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { usePublicExhibitions } from "@/hooks/usePublicExhibitions";
import { useCity } from "@/hooks/useCityContext";
import { CityCard } from "@/components/CityCard";
import { NearbyEventsSection } from "@/components/home/NearbyEventsSection";
import { deriveExhibitionCities, deriveExhibitionCategories, discoveryValuesEqual } from "@/lib/discovery";
import heroBanner from "@/assets/hero-banner.jpg";

const RECENT_SEARCHES_KEY = "exhibittix:recent-searches";
const MAX_RECENT_SEARCHES = 5;

function readRecentSearches(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(term: string) {
  try {
    const existing = readRecentSearches().filter((t) => t.toLowerCase() !== term.toLowerCase());
    const next = [term, ...existing].slice(0, MAX_RECENT_SEARCHES);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — recent searches simply won't persist this session.
  }
}

type UpcomingFilter = "all" | "week" | "month";

const UPCOMING_FILTERS: { key: UpcomingFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

// Real platform capabilities only — no unverified claims (no user/exhibition
// counts, no satisfaction percentages). Each of these maps to a feature that
// actually ships: search/filter (Discover + ExhibitionListing), Razorpay/mock
// payments (paymentService.ts), QR ticket issuance, and the scanner check-in
// flow verified end-to-end in UI-01D.
const WHY_EXHIBITTIX = [
  { icon: Search, title: "Discover Exhibitions", description: "Search and filter by city, category, and date to find exhibitions worth attending." },
  { icon: Shield, title: "Secure Payments", description: "Pay online and get instant, verified booking confirmation." },
  { icon: Smartphone, title: "Digital QR Tickets", description: "Your ticket lives on your phone — nothing to print." },
  { icon: QrCode, title: "Easy Check-in", description: "Scan your QR code at the venue and you're in." },
];

const CARD_SKELETON_COUNT = 4;

function ExhibitionCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecentSearches);
  const [upcomingFilter, setUpcomingFilter] = useState<UpcomingFilter>("all");
  // The single shared location context (see useCityContext.tsx) — the
  // header's city control is the only place this is ever *set*; the
  // homepage only reads it, for the hero's context line and to carry it
  // into any search this page submits.
  const { city } = useCity();
  const { data: exhibitions = [], isLoading, isError, refetch } = usePublicExhibitions();

  // Real per-city and per-category counts derived from the live/public
  // exhibitions this page already fetched — never a hardcoded list. Only
  // values that actually have at least one live exhibition ever appear.
  // UI-02A: shared with the header/listing pages via lib/discovery.ts so
  // every surface uses the same derivation/normalization semantics.
  const cities = useMemo(() => deriveExhibitionCities(exhibitions), [exhibitions]);
  const categories = useMemo(() => deriveExhibitionCategories(exhibitions), [exhibitions]);

  // A real photo from one of that city's own live exhibitions — never a
  // stock/scraped image (see CityCard.tsx for why, and its on-brand
  // fallback for when none exists).
  const cityImages = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of cities) {
      const withImage = exhibitions.find((e) => discoveryValuesEqual(e.city, c.value) && e.coverImageUrl);
      map.set(c.value, withImage?.coverImageUrl ?? null);
    }
    return map;
  }, [cities, exhibitions]);

  // "Featured" = the API's own default ordering (most recently published
  // live/public exhibitions first, see server/src/routes/public.ts) — not a
  // fabricated popularity signal. The badge reflects real section placement,
  // nothing more.
  const featured = useMemo(() => exhibitions.slice(0, 4), [exhibitions]);

  // Real upcoming exhibitions: filtered/sorted by each exhibition's actual
  // startDate, computed client-side from the same small already-fetched
  // dataset (this feed has no server-side date filtering — see public.ts's
  // own comment that it's an intentionally narrow homepage teaser, with
  // /discover as the real filterable engine for anything larger).
  const upcomingAll = useMemo(() => {
    const now = new Date();
    return exhibitions
      .filter((ex) => ex.startDate && new Date(ex.startDate) >= now)
      .slice()
      .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());
  }, [exhibitions]);

  // Real date-bucket filtering on each exhibition's actual startDate — no
  // fabricated "trending"/"popularity" signal, since no view/booking-count
  // data exists to back one (see report).
  const upcoming = useMemo(() => {
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const filtered = upcomingAll.filter((ex) => {
      if (upcomingFilter === "all") return true;
      const start = new Date(ex.startDate!);
      if (upcomingFilter === "week") return start <= weekEnd;
      return start <= monthEnd;
    });
    return filtered.slice(0, 6);
  }, [upcomingAll, upcomingFilter]);

  const runSearch = (term: string, categoryOverride?: string) => {
    const params = new URLSearchParams();
    const trimmed = term.trim();
    if (trimmed) {
      params.set("search", trimmed);
      pushRecentSearch(trimmed);
      setRecentSearches(readRecentSearches());
    }
    if (categoryOverride) params.set("category", categoryOverride);
    // Preserves the single shared location context — never a second,
    // competing city choice made from this form (see useCityContext.tsx).
    if (city) params.set("city", city);
    setShowSuggestions(false);
    navigate(`/exhibitions?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* =================== HERO + SEARCH =================== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBanner} alt="" className="w-full h-full object-cover" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-b from-foreground/70 via-foreground/50 to-background" />
        </div>
        <div className="relative container mx-auto px-4 pt-14 pb-20 md:pt-20 md:pb-28">
          <h1 className="font-display text-3xl md:text-5xl font-bold text-background text-center max-w-3xl mx-auto mb-3">
            Discover Exhibitions Near You
          </h1>
          <p className="text-background/80 text-center max-w-xl mx-auto mb-6">
            Find trade fairs, expos, and exhibitions across India — book tickets, explore exhibitors, and get in with a QR code.
          </p>

          <div className="max-w-2xl mx-auto">
            <form
              onSubmit={handleSearch}
              className="relative bg-card rounded-2xl shadow-lg p-3 flex flex-col sm:flex-row gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search exhibitions, categories, or keywords..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setShowSuggestions(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                  aria-label="Search exhibitions, categories, or keywords"
                  maxLength={200}
                  className="pl-9 h-11"
                />

                {/* Lightweight local suggestions — real recent searches (this
                    browser only) and real categories with live exhibitions.
                    No fabricated "popular exhibitions" ranking: there's no
                    view/booking-count data to back one. */}
                {showSuggestions && (recentSearches.length > 0 || categories.length > 0) && (
                  <div
                    role="listbox"
                    aria-label="Search suggestions"
                    className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-lg p-3 text-left z-20 max-h-80 overflow-y-auto"
                    // Keeps the panel open long enough for a click on one of
                    // its own options to register before the input's blur
                    // would otherwise close it first.
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {recentSearches.length > 0 && (
                      <div className="mb-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          <History className="w-3.5 h-3.5" aria-hidden="true" />
                          Recent searches
                        </p>
                        <ul>
                          {recentSearches.map((term) => (
                            <li key={term}>
                              <button
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-sm text-foreground"
                                onClick={() => {
                                  setSearchQuery(term);
                                  runSearch(term);
                                }}
                              >
                                {term}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {categories.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Popular categories
                        </p>
                        <ul className="flex flex-wrap gap-2">
                          {categories.slice(0, 6).map((c) => (
                            <li key={c.value}>
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-full border border-border text-sm hover:border-primary hover:text-primary transition-colors"
                                onClick={() => runSearch("", c.value)}
                              >
                                {c.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Button type="submit" size="lg" className="sm:w-auto">
                Search
              </Button>
            </form>

            {/* Read-only location context — the header's city control is the
                one place this is ever changed (see useCityContext.tsx). No
                second selector here. */}
            <p className="flex items-center justify-center gap-1.5 text-background/80 text-sm mt-4">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {city ? `Showing exhibitions near ${city}` : "Showing exhibitions across all cities"}
            </p>
          </div>
        </div>
      </section>

      {/* =================== DATA-DRIVEN DISCOVERY SECTIONS =================== */}
      {/* One shared loading/error boundary — every section below reads from
          the same single usePublicExhibitions() fetch, so there's exactly
          one real failure mode to handle, not independent per-section ones.
          Sections above/below this block (hero, Why ExhibitTix, organizer
          CTA) are static and always render regardless. */}
      {isError ? (
        <div className="container mx-auto px-4">
          <ErrorState
            title="Couldn't load exhibitions"
            description="Please try again."
            onRetry={() => refetch()}
          />
        </div>
      ) : isLoading ? (
        <div className="container mx-auto px-4 py-16 space-y-4">
          <Skeleton className="h-7 w-64" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: CARD_SKELETON_COUNT }).map((_, i) => (
              <ExhibitionCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : exhibitions.length === 0 ? (
        <div className="container mx-auto px-4">
          <EmptyState
            icon={Calendar}
            title="No exhibitions live yet"
            description="Check back soon, or browse all exhibitions."
            action={
              <Button asChild variant="outline">
                <Link to="/exhibitions">Browse Exhibitions</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Featured Exhibitions */}
          <section className="container mx-auto px-4 py-10">
            <div className="flex items-end justify-between mb-5">
              <div>
                <h2 className="font-display text-2xl font-semibold">Featured Exhibitions</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Discover exhibitions worth checking out.</p>
              </div>
              <Link to="/exhibitions" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0 ml-4">
                View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {featured.map((ex) => (
                <ExhibitionCard key={ex.id} exhibition={ex} badgeType="Featured" />
              ))}
            </div>
          </section>

          {/* Explore by Category */}
          {categories.length > 0 && (
            <section className="container mx-auto px-4 py-10">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Explore by Category</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Find exhibitions based on what interests you.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {categories.slice(0, 9).map((c) => (
                  <Link
                    key={c.value}
                    to={`/exhibitions?category=${encodeURIComponent(c.value)}`}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary hover:text-primary transition-colors text-sm font-medium"
                  >
                    <Tag className="w-4 h-4" aria-hidden="true" />
                    {c.label}
                    <span className="text-muted-foreground text-xs">({c.count})</span>
                  </Link>
                ))}
                {categories.length > 9 && (
                  <Link
                    to="/exhibitions"
                    className="flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-medium text-primary hover:underline"
                  >
                    View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* Upcoming Exhibitions */}
          {upcomingAll.length > 0 && (
            <section className="container mx-auto px-4 py-10">
              <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-primary" aria-hidden="true" />
                    Upcoming Exhibitions
                  </h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Discover what's coming up next.</p>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Filter upcoming exhibitions by date">
                  {UPCOMING_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={upcomingFilter === f.key}
                      onClick={() => setUpcomingFilter(f.key)}
                      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors min-h-[36px] ${
                        upcomingFilter === f.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border text-foreground/70 hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {upcoming.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {upcoming.map((ex) => (
                    <ExhibitionCard key={ex.id} exhibition={ex} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  title="No exhibitions in this range"
                  description="Try a wider date range, or explore everything that's upcoming."
                  action={
                    <Button variant="outline" onClick={() => setUpcomingFilter("all")}>
                      Show all upcoming
                    </Button>
                  }
                />
              )}
            </section>
          )}

          <NearbyEventsSection />

          {/* Popular Cities — discovery only. The header's own location
              control (see useCityContext.tsx) is the sole place a visitor's
              current city context is *set*; clicking one of these just
              navigates to that city's real listing, same as any other link. */}
          {cities.length > 0 && (
            <section className="container mx-auto px-4 py-10">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Popular Cities</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Explore exhibitions across India's major exhibition hubs.
                  </p>
                </div>
                <Link to="/exhibitions" className="text-sm text-primary hover:underline flex items-center gap-1 shrink-0 ml-4">
                  View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {cities.map((c) => (
                  <CityCard
                    key={c.value}
                    city={c.label}
                    slug={c.value}
                    count={c.count}
                    imageUrl={cityImages.get(c.value) ?? null}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* =================== WHY EXHIBITTIX =================== */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="font-display text-2xl font-semibold text-center mb-8">Why ExhibitTix</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {WHY_EXHIBITTIX.map((item) => (
            <div key={item.title} className="flex flex-col items-center text-center gap-2 p-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-sm">{item.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* =================== ORGANIZER CTA =================== */}
      <section className="container mx-auto px-4 pb-14">
        <div className="gradient-hero rounded-2xl p-8 md:p-12 text-center">
          <Building2 className="w-10 h-10 text-primary-foreground mx-auto mb-4" aria-hidden="true" />
          <h2 className="font-display text-2xl md:text-3xl font-bold text-primary-foreground mb-3">
            Have an Exhibition to Organize?
          </h2>
          <p className="text-primary-foreground/80 max-w-xl mx-auto mb-6">
            Reach exhibitors and visitors, manage stalls, sell tickets, and run your event from one platform.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary">
              <Link to="/exhibitor-dashboard/exhibitions/new">Create Your Exhibition</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <Link to="/how-exhibitions-work">Learn How It Works</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
