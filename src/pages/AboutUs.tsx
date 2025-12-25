import { Link } from "react-router-dom";
import { 
  Users, Target, Award, Globe, Shield, Heart, 
  Building2, Ticket, TrendingUp, CheckCircle2, ArrowRight 
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

  const team = [
    { name: "Rahul Sharma", role: "CEO & Co-Founder", avatar: "RS" },
    { name: "Priya Patel", role: "CTO & Co-Founder", avatar: "PP" },
    { name: "Vikram Singh", role: "Head of Operations", avatar: "VS" },
    { name: "Anjali Mehta", role: "Head of Marketing", avatar: "AM" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-20 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-6 bg-primary-foreground/20 text-primary-foreground border-0">
            About ExhibitTix
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6">
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
      <section className="py-12 bg-card border-b">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                Our Story
              </Badge>
              <h2 className="section-title text-left mb-6">
                Born from a Simple Idea
              </h2>
              <div className="space-y-4 text-muted-foreground">
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
            <div className="relative">
              <div className="aspect-square rounded-2xl overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"
                  alt="Exhibition venue"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-card p-6 rounded-xl shadow-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Award className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Trusted Platform</p>
                    <p className="text-sm text-muted-foreground">Since 2020</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="card-premium p-8">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Target className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-semibold mb-4">Our Mission</h3>
              <p className="text-muted-foreground">
                To democratize access to exhibitions and cultural events across India by building 
                the most user-friendly platform for discovery, booking, and exhibition management. 
                We believe everyone deserves easy access to enriching experiences.
              </p>
            </Card>
            <Card className="card-premium p-8">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Globe className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-semibold mb-4">Our Vision</h3>
              <p className="text-muted-foreground">
                To become the go-to platform for every exhibition experience in India – from 
                discovery to doorstep. We envision a future where attending an exhibition is 
                as simple as a few taps on your phone.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Our Values */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Our Values</h2>
            <p className="section-subtitle">
              The principles that guide everything we do
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <Card key={index} className="card-premium p-6 text-center">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{value.title}</h3>
                <p className="text-muted-foreground text-sm">{value.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* For Both Sides */}
      <section className="section-padding bg-foreground text-background">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-semibold mb-4 text-background">For Visitors</h3>
              <ul className="space-y-3">
                {[
                  "Discover exhibitions across 50+ cities",
                  "Secure instant ticket booking",
                  "QR-based contactless entry",
                  "Easy refunds and cancellations",
                  "Exclusive member discounts",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-background/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <Building2 className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-display text-2xl font-semibold mb-4 text-background">For Exhibitors</h3>
              <ul className="space-y-3">
                {[
                  "Reach 2M+ potential visitors",
                  "Sell tickets and stall spaces online",
                  "Real-time analytics dashboard",
                  "Secure payment processing",
                  "Dedicated support team",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-background/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding">
        <div className="container mx-auto text-center">
          <h2 className="section-title mb-6">Ready to Get Started?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Whether you're looking to discover amazing exhibitions or list your own event, 
            ExhibitTix has you covered.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitions">
              <Button size="lg" className="gap-2">
                Browse Exhibitions
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/exhibitor-dashboard/create">
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
