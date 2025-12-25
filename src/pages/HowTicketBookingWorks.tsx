import { Link } from "react-router-dom";
import { 
  Search, Ticket, CreditCard, QrCode, ArrowRight, CheckCircle2,
  Shield, Clock, Smartphone, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const HowTicketBookingWorks = () => {
  const steps = [
    {
      number: "01",
      icon: Search,
      title: "Discover Exhibitions",
      description: "Browse through hundreds of exhibitions across 50+ cities in India. Filter by category, city, date, or search for specific events.",
      details: [
        "Search by exhibition name or keyword",
        "Filter by city, category, and date",
        "View detailed event information",
        "Check ticket availability and pricing",
      ],
    },
    {
      number: "02",
      icon: Ticket,
      title: "Select Your Tickets",
      description: "Choose from various ticket types based on your preferences. Each ticket comes with different benefits and access levels.",
      details: [
        "Compare ticket options and benefits",
        "Select quantity (up to 10 per booking)",
        "Choose your preferred visit date",
        "See transparent pricing with no hidden fees",
      ],
    },
    {
      number: "03",
      icon: CreditCard,
      title: "Secure Payment",
      description: "Pay securely using your preferred payment method. We support UPI, cards, net banking, and more.",
      details: [
        "Multiple payment options (UPI, Cards, Net Banking)",
        "256-bit SSL encrypted transactions",
        "Instant payment confirmation",
        "Digital receipt sent to your email",
      ],
    },
    {
      number: "04",
      icon: QrCode,
      title: "Get Your QR Ticket",
      description: "Receive instant confirmation with a unique QR code. Just show it at the venue for contactless entry.",
      details: [
        "Instant email with QR code",
        "Access tickets from your dashboard",
        "Download or show on mobile",
        "Contactless entry at venue",
      ],
    },
  ];

  const benefits = [
    { icon: Shield, title: "100% Secure", description: "All transactions are encrypted and secure" },
    { icon: Clock, title: "Instant Confirmation", description: "Get tickets delivered immediately" },
    { icon: Smartphone, title: "Mobile-First", description: "Book and access tickets on any device" },
    { icon: Star, title: "Best Prices", description: "No hidden fees, transparent pricing" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            For Visitors
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            How Ticket Booking Works
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            Book exhibition tickets in 4 simple steps. It's quick, secure, and hassle-free.
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
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:flex-row-reverse" : ""
                }`}
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
            <h2 className="section-title">Why Book with ExhibitTix</h2>
            <p className="section-subtitle">Trusted by millions of visitors across India</p>
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

      {/* CTA */}
      <section className="section-padding">
        <div className="container mx-auto text-center">
          <h2 className="section-title mb-6">Ready to Book Your First Exhibition?</h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
            Discover amazing exhibitions happening near you and book tickets in minutes.
          </p>
          <Link to="/exhibitions">
            <Button size="lg" className="gap-2">
              Browse Exhibitions
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HowTicketBookingWorks;
