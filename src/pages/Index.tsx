import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Search, ArrowRight, Calendar, MapPin, Sparkles, Shield, 
  Smartphone, Clock, Users, TrendingUp, Building2, CheckCircle2,
  Star, Zap, Globe, Award, ChevronRight, Play, BarChart3, 
  Headphones, CalendarDays, Ticket, CreditCard
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
  const [selectedDate, setSelectedDate] = useState("");
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

  const stats = [
    { value: "500+", label: "Exhibitions", icon: Ticket },
    { value: "50+", label: "Cities", icon: MapPin },
    { value: "2M+", label: "Visitors", icon: Users },
    { value: "10K+", label: "Exhibitors", icon: Building2 },
  ];

  const cityData = [
    { name: "Mumbai", count: 45, image: "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=400" },
    { name: "Delhi", count: 38, image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400" },
    { name: "Bangalore", count: 32, image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400" },
    { name: "Chennai", count: 24, image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=400" },
    { name: "Hyderabad", count: 28, image: "https://images.unsplash.com/photo-1572373689821-79e3c2b6f1ee?w=400" },
    { name: "Ahmedabad", count: 21, image: "https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=400" },
  ];

  const exhibitorBenefits = [
    { icon: Globe, title: "Reach Millions", description: "Access 2M+ monthly visitors actively looking for exhibitions" },
    { icon: CreditCard, title: "Sell Tickets Online", description: "Secure payment processing with instant settlements" },
    { icon: BarChart3, title: "Real-time Analytics", description: "Track sales, attendance, and visitor demographics" },
    { icon: Headphones, title: "24/7 Support", description: "Dedicated account manager for your exhibition success" },
  ];

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

  const testimonials = [
    {
      name: "Priya Sharma",
      role: "Art Enthusiast, Mumbai",
      content: "ExhibitTix made it so easy to discover amazing art exhibitions. The QR entry is super convenient!",
      rating: 5,
      avatar: "PS",
    },
    {
      name: "Rajesh Patel",
      role: "Trade Fair Organizer, Ahmedabad",
      content: "As an exhibitor, the platform has helped us reach thousands of new visitors. Revenue increased by 40%!",
      rating: 5,
      avatar: "RP",
    },
    {
      name: "Ananya Gupta",
      role: "Event Planner, Delhi",
      content: "The booking process is seamless and the analytics dashboard is incredibly helpful for planning.",
      rating: 5,
      avatar: "AG",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section - Full Width Immersive */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Exhibition venue showcasing cultural events"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/95 via-foreground/80 to-foreground/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
        </div>

        <div className="container mx-auto relative z-10 py-20">
          <div className="max-w-4xl">
            <Badge className="mb-6 bg-primary/20 text-primary border-primary/30 backdrop-blur-sm animate-fade-up">
              <Sparkles className="w-3 h-3 mr-1.5" />
              India's #1 Exhibition Discovery Platform
            </Badge>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-7xl font-bold text-background leading-tight mb-6 animate-fade-up stagger-1">
              Discover Amazing
              <span className="block text-primary">Exhibitions Near You</span>
            </h1>
            
            <p className="text-lg md:text-xl text-background/70 mb-10 animate-fade-up stagger-2 max-w-2xl">
              Book tickets for trade fairs, art exhibitions, and cultural events. 
              Or list your own exhibition and reach millions of visitors.
            </p>

            {/* Premium Search Bar */}
            <form onSubmit={handleSearch} className="animate-fade-up stagger-3">
              <div className="bg-background rounded-2xl p-3 md:p-4 shadow-2xl max-w-3xl">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search exhibitions, trade fairs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 h-14 text-base border-0 bg-muted/30 focus-visible:ring-0 rounded-xl"
                    />
                  </div>
                  <div className="relative md:w-52">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full h-14 pl-12 pr-4 rounded-xl bg-muted/30 border-0 text-base focus:ring-0 focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="">All Cities</option>
                      {cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative md:w-48">
                    <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-14 pl-12 border-0 bg-muted/30 focus-visible:ring-0 rounded-xl"
                    />
                  </div>
                  <Button type="submit" size="xl" className="shrink-0 shadow-glow">
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
            </form>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-8 mt-10 animate-fade-up stagger-4">
              {stats.map((stat, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background/10 backdrop-blur-sm flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-background">{stat.value}</p>
                    <p className="text-background/60 text-sm">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Must-Visit Exhibitions - Editorial Style */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <Badge className="mb-3 bg-primary/10 text-primary border-primary/20">
                <Star className="w-3 h-3 mr-1.5" />
                Editor's Pick
              </Badge>
              <h2 className="section-title text-left">Must-Visit Exhibitions</h2>
              <p className="text-muted-foreground mt-2">Curated experiences you shouldn't miss</p>
            </div>
            <Link to="/exhibitions">
              <Button variant="outline" className="group">
                View All
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          <div className="grid lg:grid-cols-5 gap-6">
            {/* Large Featured Card */}
            {featuredExhibitions[0] && (
              <Link 
                to={`/exhibition/${featuredExhibitions[0].id}`}
                className="lg:col-span-3 group"
              >
                <Card className="overflow-hidden h-full border-0 shadow-lg hover:shadow-xl transition-all duration-500">
                  <div className="relative h-80 lg:h-[420px] overflow-hidden">
                    <img
                      src={featuredExhibitions[0].images[0]}
                      alt={featuredExhibitions[0].title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/20 to-transparent" />
                    <Badge className="absolute top-4 left-4 bg-primary text-primary-foreground">
                      <Star className="w-3 h-3 mr-1" />
                      Featured
                    </Badge>
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                      <Badge variant="secondary" className="mb-3 bg-background/20 backdrop-blur-sm text-background border-0">
                        {featuredExhibitions[0].category}
                      </Badge>
                      <h3 className="font-display text-2xl lg:text-3xl font-bold text-background mb-2 group-hover:text-primary transition-colors">
                        {featuredExhibitions[0].title}
                      </h3>
                      <p className="text-background/80 mb-4 line-clamp-2">{featuredExhibitions[0].subtitle}</p>
                      <div className="flex items-center gap-4 text-background/70 text-sm">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" />
                          {featuredExhibitions[0].city}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {new Date(featuredExhibitions[0].startDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                        </span>
                        <span className="ml-auto font-semibold text-primary text-lg">
                          ₹{featuredExhibitions[0].priceRange.min}+
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            )}

            {/* Stacked Cards */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {featuredExhibitions.slice(1, 4).map((exhibition) => (
                <Link 
                  key={exhibition.id}
                  to={`/exhibition/${exhibition.id}`}
                  className="group"
                >
                  <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300">
                    <div className="flex h-32">
                      <div className="w-32 shrink-0 overflow-hidden">
                        <img
                          src={exhibition.images[0]}
                          alt={exhibition.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      </div>
                      <CardContent className="flex-1 p-4 flex flex-col justify-center">
                        <Badge variant="outline" className="w-fit mb-2 text-xs">
                          {exhibition.category}
                        </Badge>
                        <h4 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {exhibition.title}
                        </h4>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{exhibition.subtitle}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {exhibition.city}
                          </span>
                          <span className="font-semibold text-primary">₹{exhibition.priceRange.min}+</span>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Popular Cities - Dynamic Explorer */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
              <MapPin className="w-3 h-3 mr-1.5" />
              Explore
            </Badge>
            <h2 className="section-title">Popular Cities</h2>
            <p className="section-subtitle">
              Find exhibitions happening in your city
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cityData.map((city, index) => (
              <Link
                key={city.name}
                to={`/exhibitions?city=${encodeURIComponent(city.name)}`}
                className="group relative overflow-hidden rounded-2xl aspect-[4/5] shadow-md hover:shadow-xl transition-all duration-500"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-center">
                  <h3 className="font-display text-lg font-semibold text-background group-hover:text-primary transition-colors">
                    {city.name}
                  </h3>
                  <p className="text-background/70 text-sm">{city.count} exhibitions</p>
                </div>
                <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/50 rounded-2xl transition-colors" />
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/exhibitions">
              <Button variant="outline" size="lg" className="group">
                Explore All Cities
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
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
                Coming Soon
              </Badge>
              <h2 className="section-title text-left">Upcoming Exhibitions</h2>
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

      {/* For Exhibitors - B2B SaaS Style */}
      <section className="section-padding bg-foreground text-background">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
                <Building2 className="w-3 h-3 mr-1.5" />
                For Exhibitors
              </Badge>
              <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-background mb-6">
                List Your Exhibition & 
                <span className="text-primary"> Reach Millions</span>
              </h2>
              <p className="text-background/70 text-lg mb-8">
                Join 10,000+ exhibitors who use ExhibitTix to sell tickets, manage stall bookings, 
                and grow their audience across India.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-8">
                {exhibitorBenefits.map((benefit, index) => (
                  <div key={index} className="flex gap-3 p-4 rounded-xl bg-background/5 border border-background/10">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <benefit.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-background">{benefit.title}</h4>
                      <p className="text-sm text-background/60">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-4">
                <Link to="/exhibitor-dashboard/create">
                  <Button size="lg" className="gap-2 shadow-glow">
                    List Your Exhibition
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" size="lg" className="border-background/30 text-background hover:bg-background/10">
                    Talk to Our Team
                  </Button>
                </Link>
              </div>
            </div>

            {/* Dashboard Preview */}
            <div className="relative">
              <div className="bg-card text-card-foreground rounded-2xl shadow-2xl p-6 border border-border/20">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/50">
                  <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-display font-semibold">Exhibitor Dashboard</h4>
                    <p className="text-sm text-muted-foreground">Real-time analytics</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Ticket className="w-5 h-5 text-primary" />
                      <span className="text-sm">Total Ticket Sales</span>
                    </div>
                    <span className="font-bold text-emerald">₹4,85,000</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-primary" />
                      <span className="text-sm">Stall Bookings</span>
                    </div>
                    <span className="font-bold">45 / 60</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-muted/50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-primary" />
                      <span className="text-sm">Visitors Today</span>
                    </div>
                    <span className="font-bold text-primary">1,234</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-primary/10 rounded-xl border border-primary/20">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium">Conversion Rate</span>
                    </div>
                    <span className="font-bold text-primary">12.4%</span>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-primary/30 rounded-full blur-3xl" />
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-accent/30 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Why Choose ExhibitTix</h2>
            <p className="section-subtitle">
              Trusted by millions for seamless exhibition experiences
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyChooseUs.map((item, index) => (
              <Card key={index} className="card-premium p-6 text-center group">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                  <item.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">What Our Users Say</h2>
            <p className="section-subtitle">
              Join thousands of satisfied visitors and exhibitors
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="card-premium p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-primary fill-primary" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 gradient-hero">
        <div className="container mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6">
            Ready to Explore?
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl mx-auto">
            Discover exhibitions, book tickets, or list your own event. 
            Start your journey with ExhibitTix today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitions">
              <Button variant="hero" size="xl" className="gap-2">
                Browse Exhibitions
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/exhibitor-dashboard/create">
              <Button variant="outline" size="xl" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                List Your Exhibition
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
