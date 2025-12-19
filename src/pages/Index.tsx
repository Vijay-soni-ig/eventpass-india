import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ArrowRight, Calendar, MapPin, Sparkles, Shield, Smartphone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { exhibitions, cities, categories } from "@/data/exhibitions";
import heroBanner from "@/assets/hero-banner.jpg";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const featuredExhibitions = exhibitions.filter((e) => e.featured);
  const upcomingExhibitions = exhibitions.slice(0, 4);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/exhibitions?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const whyChooseUs = [
    {
      icon: Shield,
      title: "Secure Booking",
      description: "100% safe payments with instant confirmation and e-tickets delivered to your phone.",
    },
    {
      icon: Smartphone,
      title: "QR-Based Entry",
      description: "Skip the queue with our digital QR tickets. No printing required, just scan and enter.",
    },
    {
      icon: Clock,
      title: "Easy Cancellation",
      description: "Plans changed? Get hassle-free refunds up to 24 hours before the event.",
    },
    {
      icon: Sparkles,
      title: "Exclusive Deals",
      description: "Access member-only discounts, early bird offers, and special combo packages.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative min-h-[600px] lg:min-h-[700px] flex items-center">
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Exhibition venue"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 gradient-hero opacity-90" />
        </div>

        <div className="container mx-auto relative z-10 py-20">
          <div className="max-w-3xl">
            <Badge variant="accent" className="mb-6 animate-fade-up">
              <Sparkles className="w-3 h-3 mr-1" />
              Discover India's Best Exhibitions
            </Badge>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-card leading-tight mb-6 animate-fade-up stagger-1">
              Experience Art, Culture & Innovation
            </h1>
            
            <p className="text-lg md:text-xl text-card/80 mb-8 animate-fade-up stagger-2 max-w-2xl">
              Book tickets to the most captivating exhibitions, museums, and cultural events across India. 
              Seamless booking, instant QR tickets.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="animate-fade-up stagger-3">
              <div className="bg-card rounded-2xl p-2 shadow-lg flex flex-col sm:flex-row gap-2 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search exhibitions, venues, or cities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-14 border-0 text-base bg-transparent"
                  />
                </div>
                <Button type="submit" size="xl" className="sm:w-auto">
                  Search Events
                </Button>
              </div>
            </form>

            {/* Quick Stats */}
            <div className="flex flex-wrap gap-8 mt-10 animate-fade-up stagger-4">
              <div>
                <p className="text-3xl font-bold text-card">500+</p>
                <p className="text-card/70 text-sm">Exhibitions</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-card">50+</p>
                <p className="text-card/70 text-sm">Cities</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-card">2M+</p>
                <p className="text-card/70 text-sm">Happy Visitors</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Exhibitions */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge variant="success" className="mb-3">Featured</Badge>
              <h2 className="font-display text-3xl md:text-4xl text-foreground">
                Must-Visit Exhibitions
              </h2>
            </div>
            <Link to="/exhibitions">
              <Button variant="ghost" className="group">
                View All
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-6">
            {featuredExhibitions.slice(0, 2).map((exhibition, index) => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} featured />
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-4">
              Explore by Category
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From cutting-edge technology exhibitions to timeless art collections, 
              find experiences that match your interests.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((category, index) => (
              <Link
                key={category}
                to={`/exhibitions?category=${encodeURIComponent(category)}`}
                className="group"
              >
                <Card hover className="text-center p-6">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                    <span className="text-2xl">
                      {["🎨", "🔬", "🏛️", "📷", "👗", "🎵", "🍽️", "💼"][index]}
                    </span>
                  </div>
                  <h3 className="font-medium text-foreground">{category}</h3>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming Events */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge variant="outline" className="mb-3">
                <Calendar className="w-3 h-3 mr-1" />
                Coming Soon
              </Badge>
              <h2 className="font-display text-3xl md:text-4xl text-foreground">
                Upcoming Exhibitions
              </h2>
            </div>
            <Link to="/exhibitions">
              <Button variant="outline" className="group">
                Browse All Events
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {upcomingExhibitions.map((exhibition) => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
            ))}
          </div>
        </div>
      </section>

      {/* Cities */}
      <section className="py-20">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl text-foreground mb-4">
              Popular Cities
            </h2>
            <p className="text-muted-foreground">
              Discover exhibitions happening near you
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {cities.map((city) => (
              <Link
                key={city}
                to={`/exhibitions?city=${encodeURIComponent(city)}`}
              >
                <Badge
                  variant="secondary"
                  className="px-5 py-2.5 text-base cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {city}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 gradient-hero">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl text-card mb-4">
              Why Choose ExhibitTix?
            </h2>
            <p className="text-card/80 max-w-2xl mx-auto">
              We're dedicated to making your cultural experiences seamless and memorable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyChooseUs.map((item, index) => (
              <Card key={index} className="bg-card/10 backdrop-blur-sm border-card/20 text-center p-6">
                <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-7 h-7 text-accent-foreground" />
                </div>
                <h3 className="font-display text-lg text-card mb-2">{item.title}</h3>
                <p className="text-card/70 text-sm">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto">
          <Card className="bg-primary text-primary-foreground p-10 md:p-16 text-center">
            <h2 className="font-display text-3xl md:text-4xl mb-4">
              Ready to Explore?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Join millions of art and culture enthusiasts. Book your next exhibition experience today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/exhibitions">
                <Button variant="hero" size="xl">
                  Browse Exhibitions
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" size="xl" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                  Create Account
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
