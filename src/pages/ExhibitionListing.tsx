import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Search, X, Calendar as CalendarIcon, MapPin, Grid, List, SlidersHorizontal, IndianRupee, ChevronDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { useDiscover } from "@/hooks/useDiscover";
import { EXHIBITION_CATEGORIES } from "@/lib/discovery";
import type { DiscoverEventsResponse } from "@/types/discovery";

// Phase 22.5 — this page's data layer is now GET /api/public/discover (the
// same server-side engine /discover uses) — no exhibitions are fetched or
// filtered/sorted in the browser anymore. See that route's own doc comment
// for why /api/public/exhibitions (the old, unfiltered list endpoint) was
// deliberately NOT extended instead: it has no query-param surface at all
// and is kept only for the homepage's small teaser sections.
//
// PRESERVED FROM THE OLD CLIENT-SIDE PAGE: search bar, category badges,
// price slider, date-range picker, sort select, grid/list toggle, mobile
// filter sheet, active-filter chips, "Clear all". PRESERVED URL PARAM:
// `search` (not renamed to `q`) — the homepage's own search form
// (src/pages/Index.tsx) already links here with `?search=...&city=...`,
// and that inbound link must keep working.
// CHANGED FROM THE OLD PAGE (documented, not a silent regression):
// - City is now a free-text input, not a &lt;Select&gt; populated from the
//   full fetched dataset — deriving filter options that way was itself part
//   of the "fetch everything" anti-pattern being removed here.
// - The price slider's outer bounds are a fixed ₹0–₹10,000 range instead of
//   the exact min/max of every event in the database (which likewise
//   required fetching everything to compute) — the actual filtering applied
//   is still exact (minPrice/maxPrice sent to the server), only the slider's
//   visual bounds are now a reasonable fixed default.
// - Results are paginated (20/page) instead of rendering every matching
//   event at once.

const PRICE_SLIDER_MIN = 0;
const PRICE_SLIDER_MAX = 10000;
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

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

const ExhibitionListing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const urlSearch = searchParams.get("search") || "";
  const selectedCity = searchParams.get("city") || "";
  const selectedCategory = searchParams.get("category") || "";
  const selectedSort = searchParams.get("sort") || "featured";
  const urlMinPrice = searchParams.get("minPrice");
  const urlMaxPrice = searchParams.get("maxPrice");
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [inputValue, setInputValue] = useState(urlSearch);
  useEffect(() => setInputValue(urlSearch), [urlSearch]);
  useEffect(() => {
    const handle = setTimeout(() => {
      // UI-03A: write the trimmed term — "  technology  " must not become a
      // literally-different (and confusingly-displayed, e.g. in the active
      // filter badge below) search than "technology".
      const trimmed = inputValue.trim();
      if (trimmed !== urlSearch) updateParams({ search: trimmed || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  function updateParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  }

  const [priceRange, setPriceRange] = useState<[number, number]>([
    urlMinPrice ? Number(urlMinPrice) : PRICE_SLIDER_MIN,
    urlMaxPrice ? Number(urlMaxPrice) : PRICE_SLIDER_MAX,
  ]);
  const priceFilterActive = priceRange[0] !== PRICE_SLIDER_MIN || priceRange[1] !== PRICE_SLIDER_MAX;

  const commitPriceRange = (value: [number, number]) => {
    setPriceRange(value);
    updateParams({
      minPrice: value[0] !== PRICE_SLIDER_MIN ? String(value[0]) : null,
      maxPrice: value[1] !== PRICE_SLIDER_MAX ? String(value[1]) : null,
      page: null,
    });
  };

  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(dateTo) : undefined,
  });

  const applyDateRange = (range: { from?: Date; to?: Date }) => {
    setDateRange({ from: range.from, to: range.to });
    updateParams({
      dateFrom: range.from ? range.from.toISOString().slice(0, 10) : null,
      dateTo: (range.to ?? range.from)?.toISOString().slice(0, 10) ?? null,
      page: null,
    });
  };

  const updateFilter = (key: string, value: string) => updateParams({ [key]: value || null, page: null });

  const clearFilters = () => {
    setInputValue("");
    setPriceRange([PRICE_SLIDER_MIN, PRICE_SLIDER_MAX]);
    setDateRange({ from: undefined, to: undefined });
    setSearchParams({});
  };

  const activeFiltersCount = [
    urlSearch,
    selectedCity,
    selectedCategory,
    priceFilterActive ? "price" : "",
    dateFrom ? "date" : "",
  ].filter(Boolean).length;

  // Old sort labels mapped onto the shared discover engine's sort values:
  // "featured" (default/newest) and "date" (soonest) keep their old UI
  // labels below even though the API value differs.
  const apiSort = selectedSort === "featured" ? "newest" : selectedSort === "date" ? "soonest" : selectedSort;

  const { data, isLoading, isError, refetch } = useDiscover({
    type: "events",
    q: urlSearch || undefined,
    category: selectedCategory || undefined,
    city: selectedCity || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    minPrice: priceRange[0] !== PRICE_SLIDER_MIN ? priceRange[0] : undefined,
    maxPrice: priceRange[1] !== PRICE_SLIDER_MAX ? priceRange[1] : undefined,
    sort: apiSort,
    page,
    limit: PAGE_SIZE,
  });

  const exhibitions = (data as DiscoverEventsResponse | undefined)?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Split into independent pieces so each can be its own compact popover in
  // the desktop horizontal toolbar, while the mobile sheet still renders all
  // four stacked (see FilterContent below) — same state, same handlers,
  // just two different presentations of the identical real filtering logic.
  const PriceFilterContent = () => (
    <div className="px-2">
      <Slider
        value={priceRange}
        min={PRICE_SLIDER_MIN}
        max={PRICE_SLIDER_MAX}
        step={50}
        onValueChange={(value) => setPriceRange(value as [number, number])}
        onValueCommit={(value) => commitPriceRange(value as [number, number])}
        className="mb-4"
      />
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg">
          <IndianRupee className="w-3 h-3" aria-hidden="true" />
          <span className="font-medium">{priceRange[0].toLocaleString("en-IN")}</span>
        </div>
        <span className="text-muted-foreground">to</span>
        <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg">
          <IndianRupee className="w-3 h-3" aria-hidden="true" />
          <span className="font-medium">{priceRange[1].toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );

  const DateFilterContent = () => (
    <div>
      <Calendar
        initialFocus
        mode="range"
        defaultMonth={dateRange.from}
        selected={{ from: dateRange.from, to: dateRange.to }}
        onSelect={(range) => applyDateRange({ from: range?.from, to: range?.to })}
        numberOfMonths={2}
        className="pointer-events-auto"
      />
      {dateRange.from && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => applyDateRange({ from: undefined, to: undefined })}>
          Clear dates
        </Button>
      )}
    </div>
  );

  const CityFilterContent = () => (
    <div className="p-3 w-64">
      <Label htmlFor="city-filter" className="text-sm font-medium mb-2 block">City</Label>
      <Input
        id="city-filter"
        placeholder="e.g. Ahmedabad"
        value={selectedCity}
        onChange={(e) => updateFilter("city", e.target.value)}
      />
    </div>
  );

  const CategoryFilterContent = () => (
    <div className="p-3 w-72">
      <p className="text-sm font-medium mb-2">Category</p>
      <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {EXHIBITION_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={selectedCategory === cat}
            className={cn(badgeVariants({ variant: selectedCategory === cat ? "default" : "secondary" }), "cursor-pointer transition-all hover:scale-105")}
            onClick={() => updateFilter("category", selectedCategory === cat ? "" : cat)}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );

  // Mobile sheet: all four filters stacked with their original section
  // labels/separators, unchanged from the previous sidebar's structure.
  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold mb-4 block">Price Range</Label>
        <PriceFilterContent />
      </div>
      <Separator />
      <div>
        <Label className="text-base font-semibold mb-4 block">Visit Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
              {dateRange.from ? (
                dateRange.to ? <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}</> : format(dateRange.from, "PPP")
              ) : (
                <span>Select dates</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <DateFilterContent />
          </PopoverContent>
        </Popover>
      </div>
      <Separator />
      <div>
        <Label className="text-base font-semibold mb-4 block">City</Label>
        <Input
          placeholder="e.g. Ahmedabad"
          value={selectedCity}
          onChange={(e) => updateFilter("city", e.target.value)}
        />
      </div>
      <Separator />
      <div>
        <Label className="text-base font-semibold mb-4 block">Category</Label>
        <div className="flex flex-wrap gap-2">
          {EXHIBITION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={selectedCategory === cat}
              className={cn(badgeVariants({ variant: selectedCategory === cat ? "default" : "secondary" }), "cursor-pointer transition-all hover:scale-105")}
              onClick={() => updateFilter("category", selectedCategory === cat ? "" : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="gradient-hero pt-10 pb-8 md:pt-12 md:pb-10">
        <div className="container mx-auto">
          <h1 className="font-display text-3xl md:text-4xl text-card mb-2">Discover Exhibitions</h1>
          <p className="text-card/80 max-w-2xl">
            Find trade fairs, expos, and exhibitions across India.
          </p>
        </div>
      </section>

      <div className="container mx-auto py-8">
        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="exhibitions-search" className="sr-only">Search exhibitions</label>
          <Input
            id="exhibitions-search"
            type="text"
            placeholder="Search exhibitions, venues, categories..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParams({ search: inputValue.trim() || null, page: null });
            }}
            maxLength={200}
            className="pl-12 pr-10 h-12"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => { setInputValue(""); updateParams({ search: null, page: null }); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Desktop horizontal filter toolbar */}
        <div className="hidden lg:flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-1.5 h-10" aria-pressed={!!selectedCity}>
                  <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
                  {selectedCity || "All Cities"}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto">
                <CityFilterContent />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("gap-1.5 h-10", !dateRange.from && "text-muted-foreground")} aria-pressed={!!dateRange.from}>
                  <CalendarIcon className="w-4 h-4 text-primary" aria-hidden="true" />
                  {dateRange.from ? (
                    dateRange.to ? <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}</> : format(dateRange.from, "MMM d, yyyy")
                  ) : (
                    "Any Date"
                  )}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <DateFilterContent />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-1.5 h-10" aria-pressed={!!selectedCategory}>
                  <Tag className="w-4 h-4 text-primary" aria-hidden="true" />
                  {selectedCategory || "All Categories"}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto">
                <CategoryFilterContent />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-1.5 h-10" aria-pressed={priceFilterActive}>
                  <IndianRupee className="w-4 h-4 text-primary" aria-hidden="true" />
                  {priceFilterActive
                    ? `₹${priceRange[0].toLocaleString("en-IN")} - ₹${priceRange[1].toLocaleString("en-IN")}`
                    : "Any Price"}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <PriceFilterContent />
              </PopoverContent>
            </Popover>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Select value={selectedSort} onValueChange={(v) => updateFilter("sort", v)}>
              <SelectTrigger className="w-44 h-10">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Newest</SelectItem>
                <SelectItem value="date">Date: Soonest</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex border rounded-lg overflow-hidden shrink-0">
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-10 w-10 rounded-none" onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"}>
                <Grid className="w-4 h-4" aria-hidden="true" />
              </Button>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-10 w-10 rounded-none" onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"}>
                <List className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile/tablet compact toolbar */}
        <div className="flex lg:hidden items-center gap-3 mb-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-11 gap-2">
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                Filters
                {activeFiltersCount > 0 && <Badge variant="accent" className="ml-1">{activeFiltersCount}</Badge>}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow down your search</SheetDescription>
              </SheetHeader>
              <div className="mt-6 pb-6">
                <FilterContent />
              </div>
              <div className="flex gap-2 pt-4 border-t sticky bottom-0 bg-background pb-2">
                <Button variant="outline" className="flex-1" onClick={clearFilters}>Clear all</Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <Select value={selectedSort} onValueChange={(v) => updateFilter("sort", v)}>
            <SelectTrigger className="w-40 h-11">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Newest</SelectItem>
              <SelectItem value="date">Date: Soonest</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {urlSearch && (
              <Badge variant="secondary" className="gap-1">
                "{urlSearch}"
                {/* UI-03A: a real button, not a bare onClick'd icon — the
                    icon alone was never keyboard-focusable or operable
                    via Enter/Space, so "clear search" only worked with a
                    mouse. */}
                <button
                  type="button"
                  onClick={() => { setInputValue(""); updateParams({ search: null, page: null }); }}
                  aria-label="Clear search"
                  className="rounded-full hover:bg-foreground/10 p-0.5 -m-0.5"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {selectedCity && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" aria-hidden="true" /> {selectedCity}
                <button type="button" aria-label="Clear city filter" onClick={() => updateFilter("city", "")} className="rounded-full hover:bg-foreground/10 p-0.5 -m-0.5">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {selectedCategory && (
              <Badge variant="secondary" className="gap-1">
                {selectedCategory}
                <button type="button" aria-label="Clear category filter" onClick={() => updateFilter("category", "")} className="rounded-full hover:bg-foreground/10 p-0.5 -m-0.5">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {priceFilterActive && (
              <Badge variant="secondary" className="gap-1">
                <IndianRupee className="w-3 h-3" aria-hidden="true" />
                {priceRange[0].toLocaleString()} - {priceRange[1].toLocaleString()}
                <button type="button" aria-label="Clear price filter" onClick={() => commitPriceRange([PRICE_SLIDER_MIN, PRICE_SLIDER_MAX])} className="rounded-full hover:bg-foreground/10 p-0.5 -m-0.5">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {dateFrom && (
              <Badge variant="secondary" className="gap-1">
                <CalendarIcon className="w-3 h-3" aria-hidden="true" />
                {dateRange.from ? format(dateRange.from, "MMM d") : dateFrom}
                {dateRange.to && ` - ${format(dateRange.to, "MMM d")}`}
                <button type="button" aria-label="Clear date filter" onClick={() => applyDateRange({ from: undefined, to: undefined })} className="rounded-full hover:bg-foreground/10 p-0.5 -m-0.5">
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
          </div>
        )}

        <div className="mb-4">
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Searching..." : <>Showing <span className="font-semibold text-foreground">{exhibitions.length}</span> of <span className="font-semibold text-foreground">{total}</span> exhibitions</>}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <ExhibitionCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState description="Couldn't load exhibitions." onRetry={() => refetch()} />
        ) : exhibitions.length > 0 ? (
          <>
            <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "flex flex-col gap-4"}>
              {exhibitions.map((exhibition) => (
                <ExhibitionCard key={exhibition.id} exhibition={exhibition} layout={viewMode} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page > 1) updateParams({ page: String(page - 1) }); }}
                        aria-disabled={page <= 1}
                        className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="text-sm text-muted-foreground px-3">Page {page} of {totalPages}</span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page < totalPages) updateParams({ page: String(page + 1) }); }}
                        aria-disabled={page >= totalPages}
                        className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Search}
            title="No exhibitions found"
            description={
              urlSearch
                ? `We couldn't find exhibitions matching "${urlSearch}". Try a different search term, fewer words, or another spelling.`
                : "Try adjusting your filters or search."
            }
            action={<Button onClick={clearFilters}>Clear {activeFiltersCount > 1 ? "Filters" : urlSearch ? "Search" : "Filters"}</Button>}
          />
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ExhibitionListing;
