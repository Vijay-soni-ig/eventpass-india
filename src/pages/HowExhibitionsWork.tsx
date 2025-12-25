import { Link } from "react-router-dom";
import { 
  Building2, FileText, Ticket, BarChart3, ArrowRight, CheckCircle2,
  Users, CreditCard, Headphones, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const HowExhibitionsWork = () => {
  const steps = [
    {
      number: "01",
      icon: FileText,
      title: "Create Your Listing",
      description: "Sign up as an exhibitor and create your exhibition listing with all the details visitors need to know.",
      details: [
        "Add exhibition name, description, and images",
        "Set venue location and event dates",
        "Define entry timings and event schedule",
        "Submit for quick review and approval",
      ],
    },
    {
      number: "02",
      icon: Ticket,
      title: "Set Up Tickets & Stalls",
      description: "Configure ticket types with different pricing tiers. Optionally, set up stall spaces for other exhibitors.",
      details: [
        "Create multiple ticket categories",
        "Set prices and capacity limits",
        "Configure stall layouts and pricing",
        "Enable early bird discounts",
      ],
    },
    {
      number: "03",
      icon: CreditCard,
      title: "Go Live & Sell",
      description: "Once approved, your exhibition is live! Start selling tickets and stall spaces immediately.",
      details: [
        "Instant visibility to 2M+ visitors",
        "Secure payment processing",
        "Real-time booking notifications",
        "Automated email confirmations",
      ],
    },
    {
      number: "04",
      icon: BarChart3,
      title: "Track & Manage",
      description: "Use your dashboard to track sales, manage bookings, and get insights into your audience.",
      details: [
        "Real-time sales analytics",
        "Visitor demographics and trends",
        "Easy check-in management",
        "Revenue reports and payouts",
      ],
    },
  ];

  const benefits = [
    { icon: Users, title: "2M+ Reach", description: "Access millions of potential visitors" },
    { icon: Zap, title: "Quick Setup", description: "Go live in under 30 minutes" },
    { icon: CreditCard, title: "Fast Payouts", description: "Receive payments within 48 hours" },
    { icon: Headphones, title: "Dedicated Support", description: "Personal account manager" },
  ];

  const pricingFeatures = [
    "Free exhibition listing",
    "No setup fees",
    "Competitive transaction fees",
    "Free marketing on our platform",
    "Dedicated exhibitor dashboard",
    "24/7 customer support",
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            For Exhibitors
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            How to List Your Exhibition
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            Start selling tickets and reach millions of visitors. It's free to list.
          </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="space-y-16">
            {steps.map((step, index) => (
              <div 
                key={index} 
                className={`grid lg:grid-cols-2 gap-12 items-center`}
              >
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-6xl font-bold text-primary/20">{step.number}</span>
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                      <step.icon className="w-7 h-7 text-primary" />
                    </div>
                  </div>
                  <h3 className="font-display text-2xl md:text-3xl font-bold mb-4">{step.title}</h3>
                  <p className="text-muted-foreground text-lg mb-6">{step.description}</p>
                  <ul className="space-y-3">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                        <span className="text-foreground">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                  <Card className="overflow-hidden border-0 shadow-xl">
                    <div className="aspect-video bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 flex items-center justify-center">
                      <div className="w-24 h-24 rounded-2xl bg-card shadow-lg flex items-center justify-center">
                        <step.icon className="w-12 h-12 text-primary" />
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto">
          <div className="section-header">
            <h2 className="section-title">Why Exhibitors Love Us</h2>
            <p className="section-subtitle">Join 10,000+ exhibitors who trust ExhibitTix</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="card-premium p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
                Transparent Pricing
              </Badge>
              <h2 className="section-title text-left mb-6">Free to List, Pay Only When You Sell</h2>
              <p className="text-muted-foreground text-lg mb-8">
                We believe in success-based pricing. List your exhibition for free and only pay a small 
                commission when you make a sale. No hidden fees, no surprises.
              </p>
              <ul className="space-y-3 mb-8">
                {pricingFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link to="/exhibitor-dashboard/create">
                <Button size="lg" className="gap-2">
                  Start Listing Now
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            <Card className="border-0 shadow-xl bg-primary/5 border-primary/20">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-2">Platform Fee</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-bold text-primary">5%</span>
                    <span className="text-muted-foreground">per ticket</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">+ payment gateway charges</p>
                </div>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between p-3 bg-card rounded-lg">
                    <span>Listing Fee</span>
                    <span className="font-semibold text-emerald">FREE</span>
                  </div>
                  <div className="flex justify-between p-3 bg-card rounded-lg">
                    <span>Setup Fee</span>
                    <span className="font-semibold text-emerald">FREE</span>
                  </div>
                  <div className="flex justify-between p-3 bg-card rounded-lg">
                    <span>Monthly Fee</span>
                    <span className="font-semibold text-emerald">FREE</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-primary-foreground mb-6">
            Ready to Reach Millions of Visitors?
          </h2>
          <p className="text-primary-foreground/80 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of successful exhibitors. Create your listing in minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/exhibitor-dashboard/create">
              <Button variant="hero" size="lg" className="gap-2">
                Create Exhibition
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="outline" size="lg" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10">
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HowExhibitionsWork;
