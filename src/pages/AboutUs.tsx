import { Link } from "react-router-dom";
import { 
  Users, Target, Award, Globe, Shield, Heart, 
  Building2, TrendingUp, CheckCircle2, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const AboutUs = () => {
  const stats = [
    { value: "500+", label: "Exhibitions Listed" },
    { value: "50+", label: "Cities Covered" },
    { value: "2M+", label: "Happy Visitors" },
    { value: "10K+", label: "Exhibitors" },
  ];

  const values = [
    {
      icon: Shield,
      title: "Trust & Security",
      description: "We prioritize the security of every transaction and the trust of our users above all else.",
    },
    {
      icon: Heart,
      title: "User-First Approach",
      description: "Every feature we build starts with understanding what our visitors and exhibitors truly need.",
    },
    {
      icon: Globe,
      title: "Pan-India Reach",
      description: "From metros to tier-2 cities, we're making exhibitions accessible to everyone across India.",
    },
    {
      icon: TrendingUp,
      title: "Innovation",
      description: "We continuously improve our platform with cutting-edge technology for seamless experiences.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-14 pb-12 md:pt-20 md:pb-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            About ExhibitTix
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-4">
            Connecting India with
            <span className="block">Amazing Exhibitions</span>
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            We're on a mission to make exhibition discovery and booking seamless for millions of visitors
            while empowering exhibitors to reach their audience.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 md:py-10 bg-card border-b">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y divide-border md:divide-y-0 md:divide-x">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="group text-center py-4 md:py-0 first:pt-0 md:first:pt-0"
              >
                <p className="text-3xl md:text-4xl font-bold text-primary transition-colors group-hover:text-primary/80">
                  {stat.value}
                </p>
                <p className="text-muted-foreground text-sm md:text-base">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-14 md:py-20">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                Our Story
              </Badge>
              <h2 className="section-title text-left mb-5">
                Born from a Simple Idea
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed max-w-xl">
                <p>
                  ExhibitTix was founded in 2020 with a simple observation: finding and booking tickets
                  for exhibitions in India was unnecessarily complicated. Whether it was a trade fair in
                  Ahmedabad or an art exhibition in Mumbai, visitors struggled to discover events, and
                  exhibitors lacked efficient tools to reach their audience.
                </p>
                <p>
                  We set out to change that. Today, ExhibitTix is India's leading exhibition discovery
                  and ticketing platform, connecting over 2 million visitors with 500+ exhibitions
                  across 50+ cities every year.
                </p>
                <p>
                  Our platform empowers exhibitors with powerful tools to manage bookings, sell tickets,
                  and track analytics – all while providing visitors with a seamless, secure booking
                  experience.
                </p>
              </div>
            </div>
            <div className="relative pb-8 sm:pb-0">
              <div className="aspect-square rounded-2xl overflow-hidden shadow-lg">
                <img
                  src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"
                  alt="Exhibition venue"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:-bottom-6 sm:-left-6 bg-card px-5 py-4 rounded-xl shadow-lg border w-max max-w-[calc(100%-2rem)]">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Trusted Platform</p>
                    <p className="text-xs text-muted-foreground">Since 2020</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-14 md:py-20 bg-muted/30">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="card-premium p-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">Our Mission</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                To democratize access to exhibitions and cultural events across India by building
                the most user-friendly platform for discovery, booking, and exhibition management.
                We believe everyone deserves easy access to enriching experiences.
              </p>
            </Card>
            <Card className="card-premium p-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-3">Our Vision</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                To become the go-to platform for every exhibition experience in India – from
                discovery to doorstep. We envision a future where attending an exhibition is
                as simple as a few taps on your phone.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="py-14 md:py-20">
        <div className="container mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="section-title mb-3">Our Values</h2>
            <p className="section-subtitle">
              The principles that guide everything we do
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((value, index) => (
              <Card key={index} className="card-premium p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{value.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{value.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Who We Serve */}
      <section className="py-14 md:py-20 bg-foreground text-background">
        <div className="container mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="section-title mb-3 text-background">Who We Serve</h2>
            <p className="section-subtitle text-background/60">
              Built for both sides of every exhibition
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-background/10 p-6 md:p-8 transition-colors hover:border-primary/40">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-5">
                <Users className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-4 text-background">For Visitors</h3>
              <ul className="space-y-3">
                {[
                  "Discover exhibitions across 50+ cities",
                  "Secure instant ticket booking",
                  "QR-based contactless entry",
                  "Easy refunds and cancellations",
                  "Exclusive member discounts",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                    <span className="text-background/80 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-background/10 p-6 md:p-8 transition-colors hover:border-primary/40">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-5">
                <Building2 className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-4 text-background">For Exhibitors</h3>
              <ul className="space-y-3">
                {[
                  "Reach 2M+ potential visitors",
                  "Sell tickets and stall spaces online",
                  "Real-time analytics dashboard",
                  "Secure payment processing",
                  "Dedicated support team",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                    <span className="text-background/80 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-16">
        <div className="container mx-auto text-center">
          <h2 className="section-title mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Whether you're looking to discover amazing exhibitions or list your own event,
            ExhibitTix has you covered.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitions">
              <Button size="lg" className="gap-2 group">
                Browse Exhibitions
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Button>
            </Link>
            <Link to="/exhibitor-dashboard/exhibitions/new">
              <Button variant="outline" size="lg">
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

export default AboutUs;
