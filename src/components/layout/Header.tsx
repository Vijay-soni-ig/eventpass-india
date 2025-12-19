import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Menu, X, User, Ticket, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/exhibitions?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border">
      <div className="container mx-auto">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Ticket className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl md:text-2xl text-foreground">ExhibitTix</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link to="/exhibitions" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Exhibitions
            </Link>
            <Link to="/exhibitions?category=Art%20%26%20Culture" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Art & Culture
            </Link>
            <Link to="/exhibitions?category=Science%20%26%20Tech" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Science & Tech
            </Link>
            <Link to="/exhibitions?category=History%20%26%20Heritage" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Heritage
            </Link>
          </nav>

          {/* Search Bar - Desktop */}
          <form onSubmit={handleSearch} className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search exhibitions, venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </form>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="hidden md:flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>Mumbai</span>
            </Button>
            <Link to="/dashboard">
              <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-2">
                <User className="w-4 h-4" />
                <span>Account</span>
              </Button>
            </Link>
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
          <div className="lg:hidden pb-4 animate-fade-in">
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
            <nav className="flex flex-col gap-2">
              <Link to="/exhibitions" className="py-2 px-3 rounded-lg hover:bg-secondary text-foreground" onClick={() => setIsMenuOpen(false)}>
                All Exhibitions
              </Link>
              <Link to="/exhibitions?category=Art%20%26%20Culture" className="py-2 px-3 rounded-lg hover:bg-secondary text-foreground" onClick={() => setIsMenuOpen(false)}>
                Art & Culture
              </Link>
              <Link to="/exhibitions?category=Science%20%26%20Tech" className="py-2 px-3 rounded-lg hover:bg-secondary text-foreground" onClick={() => setIsMenuOpen(false)}>
                Science & Tech
              </Link>
              <Link to="/exhibitions?category=History%20%26%20Heritage" className="py-2 px-3 rounded-lg hover:bg-secondary text-foreground" onClick={() => setIsMenuOpen(false)}>
                Heritage
              </Link>
              <Link to="/dashboard" className="py-2 px-3 rounded-lg hover:bg-secondary text-foreground" onClick={() => setIsMenuOpen(false)}>
                My Account
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
