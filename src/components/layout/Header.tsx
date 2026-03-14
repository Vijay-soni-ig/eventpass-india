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

const cities = ["Ahmedabad", "Mumbai", "Delhi", "Bangalore", "Surat", "Hyderabad", "Chennai", "Pune"];

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedCity, setSelectedCity] = useState("Ahmedabad");
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
    if (searchQuery.trim()) {
      navigate(`/exhibitions?search=${encodeURIComponent(searchQuery)}`);
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
            <Link to="/exhibitor-dashboard/create" className="hover:text-primary transition-colors font-medium text-primary">
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

              {/* City Indicator */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium text-foreground">{selectedCity}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {cities.map((city) => (
                    <DropdownMenuItem
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={cn(city === selectedCity && "bg-primary/10 text-primary")}
                    >
                      {city}
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

              <Link
                to="/about"
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive("/about")
                    ? "text-primary bg-primary/5"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                )}
              >
                About
              </Link>
              <Link
                to="/contact"
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive("/contact")
                    ? "text-primary bg-primary/5"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                )}
              >
                Contact
              </Link>
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Login/Account */}
              {!loading && (
                user ? (
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
                        <Link to="/dashboard" className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          My Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/exhibitor-dashboard" className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          Exhibitor Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2 text-destructive">
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
              >
                {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
                    className="pl-10"
                  />
                </div>
              </form>

              {/* City selector mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex sm:hidden items-center gap-1.5 text-sm text-foreground font-medium px-3 py-2.5 rounded-lg hover:bg-muted w-full mb-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    {selectedCity}
                    <ChevronDown className="w-3 h-3 ml-auto" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {cities.map((city) => (
                    <DropdownMenuItem key={city} onClick={() => setSelectedCity(city)}>
                      {city}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <nav className="flex flex-col gap-1">
                <Link to="/exhibitions" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  Exhibitions
                </Link>
                <Link to="/exhibitions?view=cities" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  Browse by City
                </Link>
                <Link to="/about" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  About
                </Link>
                <Link to="/contact" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  Contact
                </Link>
                <Link to="/exhibitors" className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium" onClick={() => setIsMenuOpen(false)}>
                  For Exhibitors
                </Link>
                
                <div className="border-t border-border my-3" />
                
                <Link
                  to="/exhibitor-dashboard/create"
                  className="py-2.5 px-3 rounded-lg bg-primary/10 text-primary font-medium flex items-center gap-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Building2 className="w-4 h-4" />
                  List Your Exhibition
                </Link>
                {user ? (
                  <>
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
