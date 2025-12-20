import { Link } from "react-router-dom";
import { 
  Building2, CheckCircle2, ArrowRight, TrendingUp, Users, 
  BarChart3, Globe, Shield, Zap, Headphones
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ForExhibitors = () => {
  const benefits = [
    { icon: Globe, title: "Reach Millions", description: "Access our network of 2M+ visitors across 50+ cities in India" },
    { icon: TrendingUp, title: "Boost Sales", description: "Sell tickets and stall spaces online with secure payments" },
    { icon: BarChart3, title: "Real-time Analytics", description: "Track sales, visitor data, and revenue in your dashboard" },
    { icon: Shield, title: "Secure Platform", description: "Enterprise-grade security for all transactions" },
    { icon: Zap, title: "Easy Setup", description: "List your exhibition in minutes with our simple form" },
    { icon: Headphones, title: "Dedicated Support", description: "24/7 support team to help you succeed" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="gradient-hero py-20 lg:py-28">
        <div className="container mx-auto text-center">
          <Badge className="mb-6 bg-accent/20 text-accent-foreground border-accent/30">
            For Exhibitors & Organizers
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-card mb-6 max-w-4xl mx-auto">
            List Your Exhibition & Reach Millions
          </h1>
          <p className="text-card/80 text-lg md:text-xl max-w-2xl mx-auto mb-8">
            Join 10,000+ exhibitors who trust ExhibitTix to sell tickets, manage bookings, and grow their audience.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitor-dashboard/create">
              <Button variant="accent" size="xl" className="gap-2">
                <Building2 className="w-5 h-5" />
                Create Exhibition
              </Button>
            </Link>
            <Link to="/exhibitor-dashboard">
              <Button variant="hero" size="xl">
                Exhibitor Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Why List With Us?</h2>
            <p className="section-subtitle">Everything you need to make your exhibition a success</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="card-premium p-6">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{benefit.title}</h3>
                <p className="text-muted-foreground text-sm">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto text-center">
          <h2 className="section-title mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Create your first exhibition listing in minutes. It's free to get started!
          </p>
          <Link to="/exhibitor-dashboard/create">
            <Button variant="default" size="xl" className="gap-2">
              Create Exhibition
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForExhibitors;
