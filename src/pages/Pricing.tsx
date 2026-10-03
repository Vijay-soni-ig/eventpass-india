import { Check, ArrowRight, Building2, HelpCircle, ReceiptText, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import SeoHead from "@/components/SeoHead";

type Plan = {
  name: string;
  eyebrow: string;
  price: string;
  cadence: string;
  description: string;
  transaction: string;
  ticketFee: string;
  stallFee: string;
  cta: string;
  href: string;
  featured?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Start Free",
    eyebrow: "First exhibition",
    price: "₹0",
    cadence: "first exhibition",
    description: "Launch your first exhibition with the core operating workflow in place.",
    transaction: "3% ticket / 1.5% stall",
    ticketFee: "3%",
    stallFee: "1.5%",
    cta: "Start Your Event",
    href: "/auth",
    features: [
      "Event setup and management",
      "Venue, halls and stall inventory",
      "Exhibitor management",
      "Visitor registration and ticketing",
      "QR check-in",
      "Lead capture and analytics",
    ],
  },
  {
    name: "Starter",
    eyebrow: "For growing organizers",
    price: "₹14,999",
    cadence: "per event",
    description: "A complete event operating layer for organizers running exhibitions regularly.",
    transaction: "2% ticket / 1% stall",
    ticketFee: "2%",
    stallFee: "1%",
    cta: "Book a Demo",
    href: "/organizer-demo",
    features: [
      "Everything in Start Free",
      "Advanced event operations",
      "Interactive floor plans",
      "Stall pricing and allocation",
      "Team and operational workflows",
      "Event-level analytics",
    ],
  },
  {
    name: "Growth",
    eyebrow: "For established organizers",
    price: "₹24,999",
    cadence: "per event",
    description: "More control and lower transaction fees for higher-volume event businesses.",
    transaction: "1% ticket / 0.5% stall",
    ticketFee: "1%",
    stallFee: "0.5%",
    cta: "Book a Demo",
    href: "/organizer-demo",
    featured: true,
    features: [
      "Everything in Starter",
      "Lower transaction fees",
      "Advanced analytics and reporting",
      "Broader team workflows",
      "Operational reporting",
      "Built for repeat event operations",
    ],
  },
  {
    name: "Enterprise",
    eyebrow: "For large portfolios",
    price: "Custom",
    cadence: "for your requirements",
    description: "A tailored commercial model for large organizers with specific event volume, operating and implementation requirements.",
    transaction: "Negotiated",
    ticketFee: "Negotiated",
    stallFee: "Negotiated",
    cta: "Talk to Sales",
    href: "/organizer-demo",
    features: [
      "Tailored commercial structure",
      "Event portfolio requirements",
      "Custom transaction economics",
      "Implementation requirements discussion",
      "Operational and reporting requirements",
      "Enterprise sales engagement",
    ],
  },
  {
    name: "Annual Growth",
    eyebrow: "For multi-event teams",
    price: "₹1,49,000",
    cadence: "per year",
    description: "Unlimited events on the Growth operating model for teams with a full event calendar.",
    transaction: "0.75% ticket / 0.5% stall",
    ticketFee: "0.75%",
    stallFee: "0.5%",
    cta: "Talk to Sales",
    href: "/organizer-demo",
    features: [
      "Everything in Growth",
      "Unlimited events",
      "Annual commercial commitment",
      "Lower ticket transaction fee",
      "Multi-event operating model",
      "Enterprise sales engagement",
    ],
  },
];

const faqs = [
  {
    q: "Who pays for ExhibitTix?",
    a: "ExhibitTix is organizer-first. The software plan is purchased by the organizer, with applicable transaction fees on ticket and stall payments.",
  },
  {
    q: "Are gateway charges included?",
    a: "No. Payment gateway charges are separate from the ExhibitTix transaction fee and depend on the payment provider and applicable payment method.",
  },
  {
    q: "What does 'first exhibition free' mean?",
    a: "The launch offer lets an organizer use the Start Free package for their first exhibition. Applicable ticket and stall transaction fees still apply.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Your commercial plan can change as your event portfolio grows. The applicable pricing version and transaction rates are recorded for payment calculations.",
  },
  {
    q: "Do you charge visitors to use ExhibitTix?",
    a: "The core SaaS commercial model is organizer-first. Any attendee-facing fee treatment depends on the configured payment and event pricing rules.",
  },
  {
    q: "What is included in Enterprise?",
    a: "Enterprise pricing is tailored to the organizer's operating model, event volume, commercial requirements and implementation needs.",
  },
];

const Pricing = () => {
  return (
    <div className="min-h-screen bg-background">
      <SeoHead title="ExhibitTix Pricing | Exhibition & Event Management Software" description="Simple organizer-first pricing for exhibitions and events. Choose per-event or annual software plans with transparent ticket and stall transaction fees." canonicalUrl="/pricing" />
      <Header />

      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,hsl(var(--primary)/0.18),transparent_35%)]" aria-hidden="true" />
          <div className="container relative mx-auto px-4 py-16 text-center md:py-20">
            <Badge className="border-primary/30 bg-primary/10 text-primary">
              ORGANIZER-FIRST PRICING
            </Badge>
            <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
              Pricing that scales with your event business.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/65 md:text-lg">
              Start with your first exhibition, move to per-event plans as you grow, or choose Annual Growth when you run events throughout the year.
            </p>

            <div className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-3 text-sm text-white/70">
              {["Organizer-first SaaS", "Per-event pricing", "Transparent transaction fees"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-12 md:py-16">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={
                  "relative flex h-full flex-col border-border " +
                  (plan.featured ? "border-primary/50 shadow-xl shadow-primary/10 lg:-translate-y-2" : "shadow-sm")
                }
              >
                {plan.featured && (
                  <div className="absolute right-4 top-4">
                    <Badge className="bg-primary text-primary-foreground">Most flexible</Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{plan.eyebrow}</p>
                  <CardTitle className="mt-2 text-xl">{plan.name}</CardTitle>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                  <div className="mt-5">
                    <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                    <span className="ml-1 text-sm text-muted-foreground">{plan.cadence}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <Button asChild className="w-full gap-2" variant={plan.featured ? "default" : "outline"}>
                    <Link to={plan.href}>
                      {plan.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>

                  <div className="mt-6 rounded-xl bg-muted/50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transaction fees</div>
                    <div className="mt-2 text-sm font-semibold">{plan.transaction}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Gateway charges separate</div>
                  </div>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm leading-5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">ExhibitTix launch transaction fee comparison</caption>
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-4 font-semibold">Plan</th>
                  <th className="px-5 py-4 font-semibold">Software price</th>
                  <th className="px-5 py-4 font-semibold">Ticket transaction</th>
                  <th className="px-5 py-4 font-semibold">Stall transaction</th>
                  <th className="px-5 py-4 font-semibold">Best fit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plans.map((plan) => (
                  <tr key={plan.name}>
                    <td className="px-5 py-4 font-semibold">{plan.name}</td>
                    <td className="px-5 py-4">{plan.price} <span className="text-muted-foreground">{plan.cadence}</span></td>
                    <td className="px-5 py-4">{plan.ticketFee}</td>
                    <td className="px-5 py-4">{plan.stallFee}</td>
                    <td className="px-5 py-4 text-muted-foreground">{plan.eyebrow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="container mx-auto grid gap-5 px-4 py-12 md:grid-cols-3 md:py-14">
            {[
              [Building2, "One organizer platform", "Events, venues, exhibitors, visitors, tickets, check-in, leads and analytics in one operating workflow."],
              [ReceiptText, "Clear payment economics", "Software pricing, transaction fees, gateway charges and taxes remain distinct so your event economics stay understandable."],
              [ShieldCheck, "Server-authoritative pricing", "Payment calculations use the configured pricing version rather than trusting values supplied by the browser."],
            ].map(([Icon, title, description]) => (
              <div key={title as string} className="rounded-2xl border border-border bg-card p-6">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description as string}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 py-14 md:py-16">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <HelpCircle className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="mt-3 text-3xl font-bold tracking-tight">Pricing questions</h2>
              <p className="mt-3 text-muted-foreground">Everything you need to understand the launch model before you talk to the team.</p>
            </div>

            <Accordion type="single" collapsible className="mt-8">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={String(index)}>
                  <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                  <AccordionContent className="leading-7 text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="container mx-auto px-4 py-14 text-center md:py-16">
            <Sparkles className="mx-auto h-6 w-6 text-primary" aria-hidden="true" />
            <h2 className="mt-4 text-3xl font-bold tracking-tight">Ready to plan your next event?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/60">
              See the organizer workflow in context and discuss which commercial model fits your event portfolio.
            </p>
            <Button asChild size="lg" className="mt-7 gap-2">
              <Link to="/organizer-demo">
                Book an Organizer Demo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Pricing;
