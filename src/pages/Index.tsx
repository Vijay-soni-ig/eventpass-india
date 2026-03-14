import { useState, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Search, ArrowRight, Calendar, MapPin, Sparkles, Shield, 
  Smartphone, Clock, Users, TrendingUp, Building2, 
  Star, Globe, ChevronRight, BarChart3, 
  Headphones, CalendarDays, Ticket, CreditCard, Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ExhibitionCard from "@/components/ExhibitionCard";
import { exhibitions, cities } from "@/data/exhibitions";
import heroBanner from "@/assets/hero-banner.jpg";

const categoryTabs = [
  "All", "Art & Culture", "Trade Shows", "Food & Lifestyle", "Science & Tech", 
  "Fashion", "Kids & Family", "Sports & Gaming", "Music", "Photography"
];

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const navigate = useNavigate();
  const tabBarRef = useRef<HTMLDivElement>(null);

  const featuredExhibitions = exhibitions.filter((e) => e.featured);

  const filteredExhibitions = useMemo(() => {
    if (activeCategory === "All") return exhibitions;
    return exhibitions.filter((e) => e.category === activeCategory);
  }, [activeCategory]);

  const upcomingExhibitions = filteredExhibitions.slice(0, 6);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("search", searchQuery);
    if (selectedCity) params.set("city", selectedCity);
    navigate(`/exhibitions?${params.toString()}`);
  };

  const cityData = [
    { name: "Mumbai", count: 45, image: "https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=400" },
    { name: "Delhi", count: 38, image: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400" },
    { name: "Bangalore", count: 32, image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400" },
    { name: "Chennai", count: 24, image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=400" },
    { name: "Hyderabad", count: 28, image: "https://images.unsplash.com/photo-1572373689821-79e3c2b6f1ee?w=400" },
    { name: "Ahmedabad", count: 21, image: "https://images.unsplash.com/photo-1595658658481-d53d3f999875?w=400" },
  ];

  const exhibitorBenefits = [
    { icon: Globe, title: "Reach Millions", description: "Access millions of monthly visitors actively looking for exhibitions" },
    { icon: CreditCard, title: "Sell Tickets Online", description: "Secure payment processing with instant settlements" },
    { icon: BarChart3, title: "Real-time Analytics", description: "Track sales, attendance, and visitor demographics" },
    { icon: Headphones, title: "24/7 Support", description: "Dedicated account manager for your exhibition success" },
  ];

  const whyChooseUs = [
    { icon: Shield, title: "Secure Booking", description: "100% safe payments with instant confirmation and e-tickets." },
    { icon: Smartphone, title: "QR-Based Entry", description: "Skip the queue with digital QR tickets. Just scan and enter." },
    { icon: Clock, title: "Easy Cancellation", description: "Hassle-free refunds up to 24 hours before the event." },
    { icon: Sparkles, title: "Exclusive Deals", description: "Access member-only discounts and early bird offers." },
  ];

  const testimonials = [
    {
      name: "Priya Sharma",
      event: "Art India 2025, Mumbai",
      content: "ExhibitTix made it so easy to discover and book tickets for amazing art exhibitions. The QR entry was super smooth!",
      rating: 5,
      avatar: "PS",
    },
    {
      name: "Rajesh Patel",
      event: "Gujarat Trade Fair 2025, Ahmedabad",
      content: "As an exhibitor, the platform helped us reach thousands of new visitors. Our ticket revenue increased by 40%!",
      rating: 5,
      avatar: "RP",
    },
    {
      name: "Ananya Gupta",
      event: "Tech Horizons 2025, Delhi",
      content: "The booking process was seamless and the analytics dashboard is incredibly helpful for planning future events.",
      rating: 5,
      avatar: "AG",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* =================== 1. HERO SECTION =================== */}
      <section className="relative flex items-center overflow-hidden" style={{ minHeight: "60vh" }}>
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Exhibition venue showcasing cultural events"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground/95 via-foreground/80 to-foreground/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
        </div>

        <div className="container mx-auto relative z-10 py-12 md:py-16 px-4">
          <div className="max-w-3xl">
            <Badge className="mb-5 bg-primary/20 text-primary border-primary/30 backdrop-blur-sm animate-fade-up">
              <Sparkles className="w-3 h-3 mr-1.5" />
              India's #1 Exhibition Discovery Platform
            </Badge>
            
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-background leading-tight mb-4 animate-fade-up stagger-1">
              Discover Amazing
              <span className="block text-primary">Exhibitions Near You</span>
            </h1>
            
            <p className="text-base md:text-lg text-background/70 mb-8 animate-fade-up stagger-2 max-w-xl">
              Book tickets for trade fairs, art exhibitions, and cultural events. 
              Or list your own exhibition and reach millions of visitors.
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="animate-fade-up stagger-3">
              <div className="bg-background rounded-2xl p-3 shadow-2xl max-w-2xl">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search exhibitions, trade fairs, art shows..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 h-12 md:h-14 text-sm md:text-base border-0 bg-muted/30 focus-visible:ring-0 rounded-xl"
                    />
                  </div>
                  <div className="relative md:w-44">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full h-12 md:h-14 pl-12 pr-4 rounded-xl bg-muted/30 border-0 text-sm md:text-base focus:ring-0 focus:outline-none appearance-none cursor-pointer"
                    >
                      <option value="">All Cities</option>
                      {cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative md:w-40">
                    <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-12 md:h-14 pl-12 border-0 bg-muted/30 focus-visible:ring-0 rounded-xl text-sm"
                    />
                  </div>
                  <Button type="submit" size="lg" className="shrink-0 min-h-[48px] shadow-glow">
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
            </form>

            {/* CTA Buttons below search */}
            <div className="flex flex-wrap gap-3 mt-6 animate-fade-up stagger-4">
              <Link to="/exhibitions">
                <Button size="lg" className="min-h-[48px] gap-2 shadow-glow">
                  Browse Exhibitions
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/exhibitor-dashboard/create">
                <Button variant="outline" size="lg" className="min-h-[48px] border-background/30 text-background hover:bg-background/10">
                  List Your Exhibition
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =================== 2. CATEGORY FILTER TAB BAR =================== */}
      <section className="border-b border-border bg-card sticky top-16 lg:top-[68px] z-40">
        <div className="container mx-auto px-4">
          <div 
            ref={tabBarRef}
            className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {categoryTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCategory(tab)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all shrink-0 ${
                  activeCategory === tab
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =================== 3. FEATURED / TRENDING EXHIBITIONS =================== */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <Badge className="mb-2 bg-primary/10 text-primary border-primary/20">
                <Star className="w-3 h-3 mr-1.5" />
                Trending
              </Badge>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">Featured Exhibitions</h2>
            </div>
            <Link to="/exhibitions">
              <Button variant="outline" size="sm" className="group shrink-0">
                View All
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          {/* Horizontal scroll row */}
          <div className="flex gap-5 overflow-x-auto pb-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {featuredExhibitions.map((exhibition, i) => (
              <div key={exhibition.id} className="w-[300px] shrink-0">
                <ExhibitionCard exhibition={exhibition} badgeType={i === 0 ? "Featured" : i === 1 ? "Trending" : i === 2 ? "Selling Fast" : "Editor's Pick"} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =================== 4. UPCOMING EXHIBITIONS (grid) =================== */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
                <Calendar className="w-3 h-3 mr-1.5" />
                Coming Soon
              </Badge>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">Upcoming Exhibitions</h2>
              <p className="text-muted-foreground mt-1 text-sm">Don't miss these exciting events</p>
            </div>
            <Link to="/exhibitions">
              <Button variant="outline" size="sm" className="group shrink-0">
                View All
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcomingExhibitions.map((exhibition) => (
              <ExhibitionCard key={exhibition.id} exhibition={exhibition} />
            ))}
          </div>

          {filteredExhibitions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No exhibitions found in this category.</p>
              <Button variant="outline" className="mt-4" onClick={() => setActiveCategory("All")}>Show All</Button>
            </div>
          )}
        </div>
      </section>

      {/* =================== 5. POPULAR CITIES =================== */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
              <MapPin className="w-3 h-3 mr-1.5" />
              Explore
            </Badge>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">Popular Cities</h2>
            <p className="text-muted-foreground mt-1">Find exhibitions happening in your city</p>
          </div>

          <div className="flex gap-4 overflow-x-auto lg:grid lg:grid-cols-6 pb-4 lg:pb-0" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {cityData.map((city) => (
              <Link
                key={city.name}
                to={`/exhibitions?city=${encodeURIComponent(city.name)}`}
                className="group relative overflow-hidden rounded-2xl aspect-[4/5] shadow-md hover:shadow-xl transition-all duration-500 shrink-0 w-[180px] lg:w-auto"
              >
                <img
                  src={city.image}
                  alt={city.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
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
        </div>
      </section>

      {/* =================== 6. LIST YOUR EXHIBITION CTA =================== */}
      <section className="py-16 md:py-20 bg-foreground text-background">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
                <Building2 className="w-3 h-3 mr-1.5" />
                For Exhibitors
              </Badge>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-background mb-6">
                List Your Exhibition & 
                <span className="text-primary"> Reach Millions</span>
              </h2>
              <p className="text-background/70 text-lg mb-8">
                Join thousands of exhibitors who use ExhibitTix to sell tickets, manage stall bookings, 
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
                  <Button size="lg" className="gap-2 shadow-glow min-h-[48px]">
                    List Your Exhibition
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline" size="lg" className="border-background/30 text-background hover:bg-background/10 min-h-[48px]">
                    Talk to Our Team →
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
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      <span className="font-bold text-primary">₹4,85,000</span>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      <span className="font-bold text-primary">1,234</span>
                    </div>
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

      {/* =================== 7. WHY CHOOSE US =================== */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">Why Choose ExhibitTix</h2>
            <p className="text-muted-foreground mt-2">Trusted by millions for seamless exhibition experiences</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

      {/* =================== 8. TESTIMONIALS =================== */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground">What Our Users Say</h2>
            <p className="text-muted-foreground mt-2">Join thousands of satisfied visitors and exhibitors</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="card-premium p-6">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-primary fill-primary" />
                  ))}
                </div>
                <p className="text-foreground mb-6 leading-relaxed line-clamp-3">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">attended {testimonial.event}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* =================== 9. READY TO EXPLORE CTA =================== */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center px-4">
          <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-primary-foreground mb-4">
            Ready to Explore?
          </h2>
          <p className="text-primary-foreground/80 text-base md:text-lg mb-8 max-w-xl mx-auto">
            Discover exhibitions, book tickets, or list your own event. 
            Start your journey with ExhibitTix today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitions">
              <Button variant="hero" size="lg" className="gap-2 min-h-[48px]">
                Browse Exhibitions
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/exhibitor-dashboard/create">
              <Button variant="outline" size="lg" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 min-h-[48px]">
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
