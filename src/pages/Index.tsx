import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Search, ArrowRight, Calendar, MapPin, Sparkles, Shield, 
  Smartphone, Clock, Users, TrendingUp, Building2, CheckCircle2,
  Star, Zap, Globe, Award
} from "lucide-react";
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
  const [selectedCity, setSelectedCity] = useState("");
  const navigate = useNavigate();

  const featuredExhibitions = exhibitions.filter((e) => e.featured);
  const upcomingExhibitions = exhibitions.slice(0, 4);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery);
    if (selectedCity) params.set("city", selectedCity);
    navigate(`/exhibitions?${params.toString()}`);
  };

  const categoryIcons: Record<string, string> = {
    "Art & Culture": "🎨",
    "Science & Tech": "🔬",
    "History & Heritage": "🏛️",
    "Photography": "📷",
    "Fashion & Lifestyle": "👗",
    "Music & Entertainment": "🎵",
    "Food & Beverage": "🍽️",
    "Trade Fair": "💼",
    "Automotive": "🚗",
    "Nature & Wildlife": "🌿",
    "Sports & Gaming": "🎮",
    "Kids & Family": "👨‍👩‍👧‍👦",
  };

  const whyChooseUs = [
    {
      icon: Shield,
      title: "Secure Booking",
      description: "100% safe payments with instant confirmation and e-tickets.",
    },
    {
      icon: Smartphone,
      title: "QR-Based Entry",
      description: "Skip the queue with digital QR tickets. Just scan and enter.",
    },
    {
      icon: Clock,
      title: "Easy Cancellation",
      description: "Hassle-free refunds up to 24 hours before the event.",
    },
    {
      icon: Sparkles,
      title: "Exclusive Deals",
      description: "Access member-only discounts and early bird offers.",
    },
  ];

  const visitorFlow = [
    { step: "1", title: "Browse", description: "Explore exhibitions by city, category, or date" },
    { step: "2", title: "Book", description: "Select tickets and complete secure payment" },
    { step: "3", title: "Visit", description: "Show your QR code at entry and enjoy" },
  ];

  const exhibitorFlow = [
    { step: "1", title: "Register", description: "Create your exhibitor account for free" },
    { step: "2", title: "List", description: "Add exhibition details, tickets, and stalls" },
    { step: "3", title: "Earn", description: "Sell tickets and manage bookings easily" },
  ];

  const stats = [
    { value: "500+", label: "Exhibitions Listed" },
    { value: "50+", label: "Cities Covered" },
    { value: "2M+", label: "Happy Visitors" },
    { value: "10K+", label: "Exhibitors" },
  ];

  const testimonials = [
    {
      name: "Priya Sharma",
      role: "Art Enthusiast, Mumbai",
      content: "ExhibitTix made it so easy to discover amazing art exhibitions. The QR entry is super convenient!",
      rating: 5,
    },
    {
      name: "Rajesh Patel",
      role: "Trade Fair Organizer, Ahmedabad",
      content: "As an exhibitor, the platform has helped us reach thousands of new visitors. Highly recommended!",
      rating: 5,
    },
    {
      name: "Ananya Gupta",
      role: "Event Planner, Delhi",
      content: "The booking process is seamless and the support team is incredibly helpful. Great platform!",
      rating: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative min-h-[650px] lg:min-h-[750px] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Exhibition venue showcasing cultural events"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 gradient-hero opacity-95" />
        </div>

        <div className="container mx-auto relative z-10 py-20">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-accent/20 text-accent-foreground border-accent/30 animate-fade-up">
              <Sparkles className="w-3 h-3 mr-1.5" />
              India's #1 Exhibition Platform
            </Badge>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-card leading-tight mb-6 animate-fade-up stagger-1">
              Discover, Book & Exhibit at Top Events
            </h1>
            
            <p className="text-lg md:text-xl text-card/80 mb-8 animate-fade-up stagger-2 max-w-2xl">
              Explore exhibitions, trade fairs, and cultural events across India. 
              Secure tickets instantly or list your own exhibition.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="animate-fade-up stagger-3">
              <div className="bg-card rounded-2xl p-2 shadow-xl flex flex-col md:flex-row gap-2 max-w-2xl">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search exhibitions, venues..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-14 border-0 text-base bg-transparent focus-visible:ring-0"
                  />
                </div>
                <div className="relative md:w-48">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full h-14 pl-12 pr-4 rounded-xl bg-muted/50 border-0 text-base focus:ring-0 focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="">All Cities</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="accent" size="xl" className="shadow-accent">
                  Browse Exhibitions
                </Button>
              </div>
            </form>

            {/* Dual CTAs */}
            <div className="flex flex-wrap items-center gap-4 mt-6 animate-fade-up stagger-4">
              <Link to="/exhibitors">
                <Button variant="hero" size="lg" className="gap-2">
                  <Building2 className="w-4 h-4" />
                  Create Exhibition
                </Button>
              </Link>
              <span className="text-card/60 text-sm">Join 10,000+ exhibitors</span>
            </div>
          </div>
        </div>

        {/* Floating stats - desktop only */}
        <div className="hidden xl:block absolute right-12 top-1/2 -translate-y-1/2 z-10">
          <div className="bg-card/10 backdrop-blur-md rounded-2xl p-6 border border-card/20 space-y-6">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl font-bold text-card">{stat.value}</p>
                <p className="text-card/70 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile Stats */}
      <section className="xl:hidden py-8 bg-primary">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-primary-foreground">{stat.value}</p>
                <p className="text-primary-foreground/70 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming Exhibitions */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
                <Calendar className="w-3 h-3 mr-1.5" />
                Coming Up
              </Badge>
              <h2 className="section-title">Upcoming Exhibitions</h2>
              <p className="text-muted-foreground mt-2">Don't miss these exciting events</p>
            </div>
            <Link to="/exhibitions">
              <Button variant="outline" className="group">
                View All Events
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

      {/* Browse by Category */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Browse by Category</h2>
            <p className="section-subtitle">
              From trade fairs to art exhibitions, find events that match your interests
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {categories.slice(0, 12).map((category) => (
              <Link
                key={category}
                to={`/exhibitions?category=${encodeURIComponent(category)}`}
                className="group"
              >
                <Card className="card-premium text-center p-5 h-full">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                    <span className="text-2xl">{categoryIcons[category] || "📦"}</span>
                  </div>
                  <h3 className="font-medium text-foreground text-sm">{category}</h3>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Exhibitions */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge className="mb-3 bg-accent/10 text-accent border-accent/20">
                <Star className="w-3 h-3 mr-1.5" />
                Featured
              </Badge>
              <h2 className="section-title">Must-Visit Exhibitions</h2>
            </div>
          </div>

          <div className="grid gap-6">
            {featuredExhibitions.slice(0, 2).map((exhibition) => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} featured />
            ))}
          </div>
        </div>
      </section>

      {/* Browse by City */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Popular Cities</h2>
            <p className="section-subtitle">
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
                  className="px-5 py-2.5 text-base cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all duration-300 border border-transparent hover:border-primary"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  {city}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* For Exhibitors Section */}
      <section className="section-padding gradient-subtle">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-emerald/10 text-emerald border-emerald/20">
                <Building2 className="w-3 h-3 mr-1.5" />
                For Exhibitors
              </Badge>
              <h2 className="section-title text-left mb-6">
                List Your Exhibition & Reach Millions
              </h2>
              <p className="text-muted-foreground text-lg mb-8">
                Join thousands of exhibitors who trust ExhibitTix to sell tickets, 
                manage bookings, and grow their audience across India.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  "Free listing for exhibitors",
                  "Powerful dashboard to manage events",
                  "Sell tickets & stall spaces online",
                  "Real-time analytics & reports",
                  "Dedicated support team",
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald/20 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-emerald" />
                    </div>
                    <span className="text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-4">
                <Link to="/exhibitor-dashboard/create">
                  <Button variant="default" size="lg" className="gap-2">
                    Create Exhibition
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/exhibitors">
                  <Button variant="outline" size="lg">
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="bg-card rounded-2xl shadow-xl p-8 border border-border/50">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold">Dashboard Preview</h4>
                    <p className="text-sm text-muted-foreground">Manage everything in one place</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Total Ticket Sales</span>
                    <span className="font-semibold text-emerald">₹2,45,000</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Stall Bookings</span>
                    <span className="font-semibold">45 / 60</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Visitors Today</span>
                    <span className="font-semibold text-primary">1,234</span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-accent/20 rounded-full blur-3xl" />
              <div className="absolute -top-4 -left-4 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">Simple steps for visitors and exhibitors</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Visitor Flow */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="font-display text-xl font-semibold">For Visitors</h3>
              </div>
              <div className="space-y-4">
                {visitorFlow.map((item, index) => (
                  <div key={index} className="flex gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                      <p className="text-muted-foreground text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exhibitor Flow */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                <Building2 className="w-5 h-5 text-emerald" />
                <h3 className="font-display text-xl font-semibold">For Exhibitors</h3>
              </div>
              <div className="space-y-4">
                {exhibitorFlow.map((item, index) => (
                  <div key={index} className="flex gap-4 p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-emerald text-emerald-foreground flex items-center justify-center font-bold shrink-0">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                      <p className="text-muted-foreground text-sm">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section-padding gradient-hero">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-card mb-4">
              Why Choose ExhibitTix?
            </h2>
            <p className="text-card/70 text-lg max-w-2xl mx-auto">
              We're dedicated to making your exhibition experience seamless and memorable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyChooseUs.map((item, index) => (
              <Card key={index} className="bg-card/10 backdrop-blur-sm border-card/20 text-center p-6 hover:bg-card/15 transition-colors">
                <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-7 h-7 text-accent-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-card mb-2">{item.title}</h3>
                <p className="text-card/70 text-sm">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="section-header">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
              <Award className="w-3 h-3 mr-1.5" />
              Testimonials
            </Badge>
            <h2 className="section-title">What Our Users Say</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="card-premium p-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-foreground mb-4">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="font-semibold text-primary">{testimonial.name[0]}</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{testimonial.name}</p>
                    <p className="text-muted-foreground text-xs">{testimonial.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <Card className="bg-primary text-primary-foreground p-10 md:p-16 text-center overflow-hidden relative">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-card rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Ready to Explore?
              </h2>
              <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
                Join millions of art and culture enthusiasts. Book your next exhibition experience or list your own event today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/exhibitions">
                  <Button variant="hero" size="xl">
                    Browse Exhibitions
                  </Button>
                </Link>
                <Link to="/exhibitor-dashboard/create">
                  <Button variant="outline" size="xl" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                    Create Exhibition
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
