import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Filter, X, ChevronDown, Calendar, MapPin, Grid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { exhibitions, cities, categories } from "@/data/exhibitions";

const ExhibitionListing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  const searchQuery = searchParams.get("search") || "";
  const selectedCity = searchParams.get("city") || "";
  const selectedCategory = searchParams.get("category") || "";
  const selectedSort = searchParams.get("sort") || "featured";

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
  };

  const activeFiltersCount = [searchQuery, selectedCity, selectedCategory].filter(Boolean).length;

  const filteredExhibitions = useMemo(() => {
    let result = [...exhibitions];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.venue.toLowerCase().includes(query) ||
          e.city.toLowerCase().includes(query)
      );
    }

    if (selectedCity) {
      result = result.filter((e) => e.city === selectedCity);
    }

    if (selectedCategory) {
      result = result.filter((e) => e.category === selectedCategory);
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
      case "featured":
      default:
        result.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }

    return result;
  }, [searchQuery, selectedCity, selectedCategory, selectedSort]);

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
            Explore {exhibitions.length}+ exhibitions across India. Use filters to find the perfect experience.
          </p>
        </div>
      </section>

      <div className="container mx-auto py-8">
        {/* Search & Filter Bar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search exhibitions..."
              value={searchQuery}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-12 h-12"
            />
          </div>

          <div className="flex gap-3">
            <Select value={selectedCity} onValueChange={(v) => updateFilter("city", v)}>
              <SelectTrigger className="w-40 h-12">
                <MapPin className="w-4 h-4 mr-2" />
                <SelectValue placeholder="City" />
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

            <Select value={selectedCategory} onValueChange={(v) => updateFilter("category", v)}>
              <SelectTrigger className="w-44 h-12">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSort} onValueChange={(v) => updateFilter("sort", v)}>
              <SelectTrigger className="w-36 h-12">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="rating">Top Rated</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>

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
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}

        {/* Results */}
        <div className="mb-4">
          <p className="text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filteredExhibitions.length}</span> exhibitions
          </p>
        </div>

        {filteredExhibitions.length > 0 ? (
          <div
            className={
              viewMode === "grid"
                ? "grid md:grid-cols-2 lg:grid-cols-3 gap-6"
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

      <Footer />
    </div>
  );
};

export default ExhibitionListing;
