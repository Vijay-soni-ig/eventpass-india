import { Link } from "react-router-dom";
import { Clock, CheckCircle2, XCircle, AlertCircle, ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const RefundPolicy = () => {
  const refundableScenarios = [
    "Cancellation made 24+ hours before the event",
    "Exhibition cancelled by the organizer",
    "Duplicate booking made in error",
    "Technical error during booking process",
    "Event postponed and new date doesn't work for you",
  ];

  const nonRefundableScenarios = [
    "Cancellation made less than 24 hours before the event",
    "No-show on the day of the event",
    "Change of mind after booking",
    "Arriving late and missing part of the event",
    "Weather conditions (unless event is cancelled)",
  ];

  const refundTimeline = [
    { step: "Request", time: "Instant", description: "Submit cancellation from your dashboard" },
    { step: "Review", time: "1-2 hours", description: "Automatic verification of eligibility" },
    { step: "Processing", time: "24-48 hours", description: "Refund initiated to original payment method" },
    { step: "Credit", time: "3-7 days", description: "Amount credited based on your bank" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="py-16 gradient-hero">
        <div className="container mx-auto text-center">
          <Badge className="mb-4 bg-primary-foreground/20 text-primary-foreground border-0">
            Policies
          </Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            Refund & Cancellation Policy
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            We keep our refund policy simple and transparent. Here's everything you need to know.
          </p>
        </div>
      </section>

      {/* Quick Overview */}
      <section className="section-padding">
        <div className="container mx-auto">
          <div className="max-w-4xl mx-auto">
            <Card className="border-0 shadow-lg bg-primary/5 border-primary/20 mb-12">
              <CardContent className="p-8 text-center">
                <Clock className="w-12 h-12 text-primary mx-auto mb-4" />
                <h2 className="font-display text-2xl font-bold mb-2">24-Hour Free Cancellation</h2>
                <p className="text-muted-foreground text-lg">
                  Cancel up to 24 hours before the event for a full refund. No questions asked.
                </p>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Refundable */}
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald" />
                    </div>
                    <h3 className="font-display text-lg font-semibold">Full Refund Eligible</h3>
                  </div>
                  <ul className="space-y-3">
                    {refundableScenarios.map((item, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Non-Refundable */}
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-destructive" />
                    </div>
                    <h3 className="font-display text-lg font-semibold">Not Eligible for Refund</h3>
                  </div>
                  <ul className="space-y-3">
                    {nonRefundableScenarios.map((item, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Refund Timeline */}
            <h2 className="section-title text-center mb-8">Refund Timeline</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
              {refundTimeline.map((item, index) => (
                <Card key={index} className="card-premium text-center">
                  <CardContent className="p-5">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <span className="font-bold text-primary">{index + 1}</span>
                    </div>
                    <h4 className="font-semibold mb-1">{item.step}</h4>
                    <p className="text-primary font-medium text-sm mb-1">{item.time}</p>
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* How to Cancel */}
            <Card className="border-0 shadow-lg mb-12">
              <CardContent className="p-8">
                <h2 className="font-display text-xl font-semibold mb-6">How to Cancel Your Booking</h2>
                <ol className="space-y-4">
                  <li className="flex gap-4">
                    <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">1</span>
                    <div>
                      <p className="font-medium">Log in to your account</p>
                      <p className="text-sm text-muted-foreground">Go to ExhibitTix and sign in</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">2</span>
                    <div>
                      <p className="font-medium">Navigate to My Bookings</p>
                      <p className="text-sm text-muted-foreground">Find your booking in the dashboard</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">3</span>
                    <div>
                      <p className="font-medium">Click "Cancel Booking"</p>
                      <p className="text-sm text-muted-foreground">Confirm your cancellation request</p>
                    </div>
                  </li>
                  <li className="flex gap-4">
                    <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">4</span>
                    <div>
                      <p className="font-medium">Receive confirmation</p>
                      <p className="text-sm text-muted-foreground">Get email with refund details</p>
                    </div>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* Important Notes */}
            <Card className="border-0 shadow-lg bg-muted/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-primary shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-2">Important Notes</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>• Refunds are processed to the original payment method only</li>
                      <li>• Bank processing times vary (UPI: 1-2 days, Cards: 5-7 days, Net Banking: 3-5 days)</li>
                      <li>• Convenience fees may not be refundable in some cases</li>
                      <li>• Special promotional tickets may have different refund policies</li>
                      <li>• For group bookings (5+ tickets), please contact support for cancellation</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Need Help */}
      <section className="section-padding bg-muted/30">
        <div className="container mx-auto text-center">
          <HelpCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="section-title mb-4">Need Help with Refund?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Our support team is available to help you with any refund-related queries.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/contact">
              <Button size="lg" className="gap-2">
                Contact Support
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/help">
              <Button variant="outline" size="lg">
                View Help Center
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default RefundPolicy;
