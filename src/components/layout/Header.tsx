import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Menu, X, User, ChevronDown, Ticket, LogOut, MapPin, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useCity } from "@/hooks/useCityContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PRIMARY_CITIES } from "@/lib/discovery";
import { Check } from "lucide-react";

// UI-02A: this was a locally-defined array duplicating (and, for
// "Bangalore" vs the real seeded "Bengaluru", actually diverging from) the
// canonical list — now the shared `PRIMARY_CITIES` from lib/discovery.ts.
// Deliberately still static, not derived from a fetch: see that file's own
// comment for why the header (rendered on every public page, including ones
// with no other reason to fetch exhibition data) shouldn't trigger one just
// to populate this menu.
const cities = PRIMARY_CITIES;

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const { city: selectedCity, setCity: setSelectedCity } = useCity();
  const cityLabel = selectedCity ?? "All Cities";
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // UI-03A: write the trimmed term — see Index.tsx's own handleSearch for
    // why raw whitespace should never reach the URL.
    const trimmed = searchQuery.trim();
    if (trimmed) {
      const params = new URLSearchParams();
      params.set("search", trimmed);
      // Carries the header's own location context into the search, so a
      // search from any page never silently drops the city the visitor
      // already chose (see useCityContext.tsx).
      if (selectedCity) params.set("city", selectedCity);
      navigate(`/exhibitions?${params.toString()}`);
      setIsMenuOpen(false);
    }
  };

  const isActive = (href: string) => {
    return location.pathname === href;
  };

  return (
    <>
      {/* Utility Bar */}
      <div className="bg-foreground text-background/70 text-xs hidden md:block">
        <div className="container mx-auto flex items-center justify-between h-8 px-4">
          <div className="flex items-center gap-4">
            <Link to="/help" className="hover:text-background transition-colors">Help Center</Link>
            <Link to="/about" className="hover:text-background transition-colors">About Us</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/exhibitors" className="hover:text-background transition-colors flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              For Exhibitors
            </Link>
            <Link to="/exhibitor-dashboard/exhibitions/new" className="hover:text-primary transition-colors font-medium text-primary">
              List Your Exhibition
            </Link>
          </div>
        </div>
      </div>

      <header
        className={cn(
          "sticky top-0 z-50 transition-all duration-300",
          isScrolled
            ? "bg-card/95 backdrop-blur-md border-b border-border shadow-xs"
            : "bg-card border-b border-border/50"
        )}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 lg:h-[68px] gap-3">
            {/* Logo + City */}
            <div className="flex items-center gap-3 shrink-0">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg gradient-hero flex items-center justify-center shadow-glow">
                  <Ticket className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-display text-lg lg:text-xl font-bold text-foreground">
                  Exhibit<span className="text-primary">Tix</span>
                </span>
              </Link>

              {/* City Indicator — the single primary location control for
                  the whole app (see useCityContext.tsx); every other
                  city-related UI on the homepage reads this same value. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
                    aria-label={`Location: ${cityLabel}. Change location`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                    <span className="font-medium text-foreground max-w-24 truncate">{cityLabel}</span>
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 max-h-80 overflow-y-auto">
                  <DropdownMenuItem
                    onClick={() => setSelectedCity(null)}
                    className={cn("flex items-center justify-between", selectedCity === null && "bg-primary/10 text-primary")}
                  >
                    All Cities
                    {selectedCity === null && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <p className="px-2 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Popular
                  </p>
                  {cities.map((city) => (
                    <DropdownMenuItem
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={cn("flex items-center justify-between", city === selectedCity && "bg-primary/10 text-primary")}
                    >
                      {city}
                      {city === selectedCity && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Search Bar - Desktop (prominent) */}
            <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-lg mx-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search exhibitions, trade fairs, art shows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search exhibitions"
                  maxLength={200}
                  className="pl-10 h-10 bg-muted/50 border-border/50 focus:border-primary focus:bg-card text-sm w-full"
                />
              </div>
            </form>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1 shrink-0">
              <Link
                to="/exhibitions"
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive("/exhibitions")
                    ? "text-primary bg-primary/5"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                )}
              >
                Exhibitions
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1">
                    Cities
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {cities.map((city) => (
                    <DropdownMenuItem key={city} asChild>
                      <Link to={`/exhibitions?city=${encodeURIComponent(city)}`}>{city}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Login/Account */}
              {!loading && (
                user ? (
                  <>
                  <NotificationBell />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1.5 hidden sm:flex">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="hidden lg:inline max-w-20 truncate text-sm">{user.email?.split('@')[0]}</span>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link to="/my-tickets" className="flex items-center gap-2">
                          <Ticket className="w-4 h-4" />
                          My Tickets
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard" className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          My Dashboard
                        </Link>
                      </DropdownMenuItem>
                      {/* UI-04 fix: this previously rendered for every logged-in
                          user regardless of role — a plain visitor with no
                          exhibitor account saw an "Exhibitor Dashboard" link
                          that led to a route their own ExhibitorRoute guard
                          would immediately bounce them out of. Visitors are
                          consumers; only show this to someone who actually has
                          an exhibitor membership. */}
                      {(user.roles?.exhibitor.length ?? 0) > 0 && (
                        <DropdownMenuItem asChild>
                          <Link to="/exhibitor-dashboard" className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Exhibitor Dashboard
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 text-destructive">
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </>
                ) : (
                  <Link to="/auth" className="hidden sm:block">
                    <Button size="sm" className="gap-1.5 min-h-[40px] px-4">
                      <User className="w-4 h-4" />
                      Login / Sign Up
                    </Button>
                  </Link>
                )
              )}

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="lg:hidden pb-6 animate-slide-down border-t border-border/50 pt-4">
              <form onSubmit={handleSearch} className="mb-4 md:hidden">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search exhibitions, trade fairs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search exhibitions"
                    maxLength={200}
                    className="pl-10"
                  />
                </div>
              </form>

              {/* City selector mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex sm:hidden items-center gap-1.5 text-sm text-foreground font-medium px-3 py-2.5 rounded-lg hover:bg-muted w-full mb-2"
                    aria-label={`Location: ${cityLabel}. Change location`}
                  >
                    <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
                    {cityLabel}
                    <ChevronDown className="w-3 h-3 ml-auto" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 max-h-80 overflow-y-auto">
                  <DropdownMenuItem
                    onClick={() => setSelectedCity(null)}
                    className={cn("flex items-center justify-between", selectedCity === null && "bg-primary/10 text-primary")}
                  >
                    All Cities
                    {selectedCity === null && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {cities.map((city) => (
                    <DropdownMenuItem
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={cn("flex items-center justify-between", city === selectedCity && "bg-primary/10 text-primary")}
                    >
                      {city}
                      {city === selectedCity && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <nav className="flex flex-col gap-1">
                <Link to="/exhibitions" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  Exhibitions
                </Link>
                {/* UI-02A fix: this previously linked to `/exhibitions?view=cities`,
                    a query param ExhibitionListing.tsx never reads (its own
                    `view` state is an unrelated grid/list toggle) — a dead
                    link that never actually showed a "browse by city" UI.
                    Replaced with the same real per-city links the desktop
                    Cities dropdown already uses. */}
                <p className="pt-1 pb-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Browse by City
                </p>
                <div className="flex flex-wrap gap-2 px-3 pb-2">
                  {cities.map((city) => (
                    <Link
                      key={city}
                      to={`/exhibitions?city=${encodeURIComponent(city)}`}
                      className="px-3 py-1.5 rounded-full border border-border text-sm hover:bg-muted hover:border-primary transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {city}
                    </Link>
                  ))}
                </div>
                <Link to="/exhibitors" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  For Exhibitors
                </Link>
                
                <div className="border-t border-border my-3" />
                
                <Link
                  to="/exhibitor-dashboard/exhibitions/new"
                  className="py-2.5 px-3 rounded-lg bg-primary/10 text-primary font-medium flex items-center gap-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Building2 className="w-4 h-4" />
                  List Your Exhibition
                </Link>
                {user ? (
                  <>
                    <Link to="/my-tickets" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                      <Ticket className="w-4 h-4" />
                      My Tickets
                    </Link>
                    <Link to="/dashboard" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
                      <User className="w-4 h-4" />
                      My Dashboard
                    </Link>
                    <button
                      onClick={() => { handleSignOut(); setIsMenuOpen(false); }}
                      className="py-2.5 px-3 rounded-lg hover:bg-muted text-destructive font-medium flex items-center gap-2 w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link to="/auth" className="py-2.5 px-3 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 min-h-[48px]" onClick={() => setIsMenuOpen(false)}>
                    <User className="w-4 h-4" />
                    Login / Sign Up
                  </Link>
                )}
              </nav>
            </div>
          )}
        </div>
      </header>
    </>
  );
};

export default Header;
