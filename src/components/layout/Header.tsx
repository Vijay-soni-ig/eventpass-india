import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Menu, X, User, ChevronDown, Plus, Building2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

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

  const navLinks = [
    { label: "Exhibitions", href: "/exhibitions" },
    { label: "Cities", href: "/exhibitions?view=cities", hasDropdown: true },
    { label: "Categories", href: "/exhibitions?view=categories", hasDropdown: true },
    { label: "For Exhibitors", href: "/exhibitors" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ];

  const cities = ["Ahmedabad", "Mumbai", "Delhi", "Bangalore", "Surat", "Hyderabad", "Chennai", "Pune"];
  const categories = ["Trade Fair", "Jewellery", "Fashion", "Technology", "Food & Beverage", "Art & Culture", "Education", "Automotive"];

  const isActive = (href: string) => {
    if (href === "/exhibitions" && location.pathname === "/exhibitions") return true;
    return location.pathname === href;
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-card/95 backdrop-blur-md border-b border-border shadow-xs"
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-glow">
              <Ticket className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl lg:text-2xl font-bold text-foreground">
              Exhibit<span className="text-primary">Tix</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            <Link
              to="/exhibitions"
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive("/exhibitions")
                  ? "text-primary bg-primary/5"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              )}
            >
              Exhibitions
            </Link>

            {/* Cities Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1">
                  Cities
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {cities.map((city) => (
                  <DropdownMenuItem key={city} asChild>
                    <Link to={`/exhibitions?city=${encodeURIComponent(city)}`}>
                      {city}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Categories Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1">
                  Categories
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {categories.map((category) => (
                  <DropdownMenuItem key={category} asChild>
                    <Link to={`/exhibitions?category=${encodeURIComponent(category)}`}>
                      {category}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link
              to="/exhibitors"
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive("/exhibitors")
                  ? "text-primary bg-primary/5"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              )}
            >
              For Exhibitors
            </Link>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2 lg:gap-3">
            {/* Search - Desktop */}
            <form onSubmit={handleSearch} className="hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-44 lg:w-56 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-card"
                />
              </div>
            </form>

            {/* Create Exhibition CTA */}
            <Link to="/exhibitor-dashboard/create" className="hidden sm:block">
              <Button variant="default" size="sm" className="gap-1.5 shadow-glow">
                <Plus className="w-4 h-4" />
                <span className="hidden lg:inline">Create Exhibition</span>
                <span className="lg:hidden">Create</span>
              </Button>
            </Link>

            {/* Login/Account */}
            <Link to="/dashboard" className="hidden sm:block">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <User className="w-4 h-4" />
                <span className="hidden lg:inline">Login</span>
              </Button>
            </Link>

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
          <div className="lg:hidden pb-6 animate-slide-down">
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search exhibitions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>
            
            <nav className="flex flex-col gap-1">
              <Link
                to="/exhibitions"
                className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Exhibitions
              </Link>
              <Link
                to="/exhibitions?view=cities"
                className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Browse by City
              </Link>
              <Link
                to="/exhibitions?view=categories"
                className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                Browse by Category
              </Link>
              <Link
                to="/exhibitors"
                className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium"
                onClick={() => setIsMenuOpen(false)}
              >
                For Exhibitors
              </Link>
              
              <div className="border-t border-border my-3" />
              
              <Link
                to="/exhibitor-dashboard/create"
                className="py-2.5 px-3 rounded-lg bg-primary text-primary-foreground font-medium flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <Building2 className="w-4 h-4" />
                Create Exhibition
              </Link>
              <Link
                to="/dashboard"
                className="py-2.5 px-3 rounded-lg hover:bg-muted text-foreground font-medium flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <User className="w-4 h-4" />
                Login / Sign Up
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
