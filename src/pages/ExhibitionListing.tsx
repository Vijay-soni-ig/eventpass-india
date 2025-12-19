import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { Search, X, Calendar as CalendarIcon, MapPin, Grid, List, SlidersHorizontal, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { exhibitions, cities, categories, getPriceRange } from "@/data/exhibitions";

const ExhibitionListing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  const priceRangeLimits = getPriceRange();
  
  const searchQuery = searchParams.get("search") || "";
  const selectedCity = searchParams.get("city") || "";
  const selectedCategory = searchParams.get("category") || "";
  const selectedSort = searchParams.get("sort") || "featured";
  
  const [priceRange, setPriceRange] = useState<[number, number]>([priceRangeLimits.min, priceRangeLimits.max]);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchParams({});
    setPriceRange([priceRangeLimits.min, priceRangeLimits.max]);
    setDateRange({ from: undefined, to: undefined });
  };

  const activeFiltersCount = [
    searchQuery, 
    selectedCity, 
    selectedCategory,
    priceRange[0] !== priceRangeLimits.min || priceRange[1] !== priceRangeLimits.max ? "price" : "",
    dateRange.from ? "date" : "",
  ].filter(Boolean).length;

  const filteredExhibitions = useMemo(() => {
    let result = [...exhibitions];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.venue.toLowerCase().includes(query) ||
          e.city.toLowerCase().includes(query) ||
          e.category.toLowerCase().includes(query)
      );
    }

    if (selectedCity) {
      result = result.filter((e) => e.city === selectedCity);
    }

    if (selectedCategory) {
      result = result.filter((e) => e.category === selectedCategory);
    }

    // Price filter
    result = result.filter(
      (e) => e.priceRange.min >= priceRange[0] && e.priceRange.min <= priceRange[1]
    );

    // Date filter
    if (dateRange.from) {
      result = result.filter((e) => {
        const exhibitionStart = new Date(e.startDate);
        const exhibitionEnd = new Date(e.endDate);
        const filterFrom = dateRange.from!;
        const filterTo = dateRange.to || dateRange.from!;
        
        return exhibitionStart <= filterTo && exhibitionEnd >= filterFrom;
      });
    }

    switch (selectedSort) {
      case "price-low":
        result.sort((a, b) => a.priceRange.min - b.priceRange.min);
        break;
      case "price-high":
        result.sort((a, b) => b.priceRange.min - a.priceRange.min);
        break;
      case "rating":
        result.sort((a, b) => b.rating - a.rating);
        break;
      case "date":
        result.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        break;
      case "featured":
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [searchQuery, selectedCity, selectedCategory, selectedSort, priceRange, dateRange]);

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Price Range Slider */}
      <div>
        <Label className="text-base font-semibold mb-4 block">Price Range</Label>
        <div className="px-2">
          <Slider
            value={priceRange}
            min={priceRangeLimits.min}
            max={priceRangeLimits.max}
            step={50}
            onValueChange={(value) => setPriceRange(value as [number, number])}
            className="mb-4"
          />
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg">
              <IndianRupee className="w-3 h-3" />
              <span className="font-medium">{priceRange[0].toLocaleString("en-IN")}</span>
            </div>
            <span className="text-muted-foreground">to</span>
            <div className="flex items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg">
              <IndianRupee className="w-3 h-3" />
              <span className="font-medium">{priceRange[1].toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Date Range Picker */}
      <div>
        <Label className="text-base font-semibold mb-4 block">Visit Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !dateRange.from && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                  </>
                ) : (
                  format(dateRange.from, "PPP")
                )
              ) : (
                <span>Select dates</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange.from}
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        {dateRange.from && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setDateRange({ from: undefined, to: undefined })}
          >
            Clear dates
          </Button>
        )}
      </div>

      <Separator />

      {/* City Filter */}
      <div>
        <Label className="text-base font-semibold mb-4 block">City</Label>
        <Select value={selectedCity} onValueChange={(v) => updateFilter("city", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All Cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Cities</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city} value={city}>
                {city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Category Filter */}
      <div>
        <Label className="text-base font-semibold mb-4 block">Category</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? "default" : "secondary"}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => updateFilter("category", selectedCategory === cat ? "" : cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Page Header */}
      <section className="gradient-hero py-12 md:py-16">
        <div className="container mx-auto">
          <h1 className="font-display text-3xl md:text-4xl text-card mb-4">
            Discover Exhibitions
          </h1>
          <p className="text-card/80 max-w-2xl">
            Explore {exhibitions.length}+ exhibitions across {cities.length} cities. Use filters to find the perfect experience.
          </p>
        </div>
      </section>

      <div className="container mx-auto py-8">
        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Desktop Sidebar Filters */}
          <aside className="hidden lg:block lg:col-span-1">
            <Card className="p-6 sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-lg">Filters</h2>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </div>
              <FilterContent />
            </Card>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search exhibitions, venues, categories..."
                  value={searchQuery}
                  onChange={(e) => updateFilter("search", e.target.value)}
                  className="pl-12 h-12"
                />
              </div>

              <div className="flex gap-3">
                {/* Mobile Filter Button */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="lg:hidden h-12 gap-2">
                      <SlidersHorizontal className="w-4 h-4" />
                      Filters
                      {activeFiltersCount > 0 && (
                        <Badge variant="accent" className="ml-1">{activeFiltersCount}</Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[320px] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Filters</SheetTitle>
                      <SheetDescription>
                        Narrow down your search
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6">
                      <FilterContent />
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Sort */}
                <Select value={selectedSort} onValueChange={(v) => updateFilter("sort", v)}>
                  <SelectTrigger className="w-40 h-12">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured">Featured</SelectItem>
                    <SelectItem value="rating">Top Rated</SelectItem>
                    <SelectItem value="date">Date: Soonest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>

                {/* View Toggle */}
                <div className="hidden md:flex border rounded-lg overflow-hidden">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-12 w-12 rounded-none"
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-12 w-12 rounded-none"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Active Filters */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {searchQuery && (
                  <Badge variant="secondary" className="gap-1">
                    "{searchQuery}"
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => updateFilter("search", "")}
                    />
                  </Badge>
                )}
                {selectedCity && (
                  <Badge variant="secondary" className="gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedCity}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => updateFilter("city", "")}
                    />
                  </Badge>
                )}
                {selectedCategory && (
                  <Badge variant="secondary" className="gap-1">
                    {selectedCategory}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => updateFilter("category", "")}
                    />
                  </Badge>
                )}
                {(priceRange[0] !== priceRangeLimits.min || priceRange[1] !== priceRangeLimits.max) && (
                  <Badge variant="secondary" className="gap-1">
                    <IndianRupee className="w-3 h-3" />
                    {priceRange[0].toLocaleString()} - {priceRange[1].toLocaleString()}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => setPriceRange([priceRangeLimits.min, priceRangeLimits.max])}
                    />
                  </Badge>
                )}
                {dateRange.from && (
                  <Badge variant="secondary" className="gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {format(dateRange.from, "MMM d")}
                    {dateRange.to && ` - ${format(dateRange.to, "MMM d")}`}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => setDateRange({ from: undefined, to: undefined })}
                    />
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear all
                </Button>
              </div>
            )}

            {/* Results Count */}
            <div className="mb-4">
              <p className="text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{filteredExhibitions.length}</span> exhibitions
              </p>
            </div>

            {/* Results Grid */}
            {filteredExhibitions.length > 0 ? (
              <div
                className={
                  viewMode === "grid"
                    ? "grid md:grid-cols-2 xl:grid-cols-3 gap-6"
                    : "flex flex-col gap-6"
                }
              >
                {filteredExhibitions.map((exhibition) => (
                  <ExhibitionCard
                    key={exhibition.id}
                    exhibition={exhibition}
                    featured={viewMode === "list"}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-xl mb-2">No exhibitions found</h3>
                <p className="text-muted-foreground mb-6">
                  Try adjusting your filters or search terms
                </p>
                <Button onClick={clearFilters}>Clear Filters</Button>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ExhibitionListing;
