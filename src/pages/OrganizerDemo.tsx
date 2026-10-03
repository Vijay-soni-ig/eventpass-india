import { useMemo, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Loader2, Mail, Phone, Users } from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/apiClient";
import SeoHead from "@/components/SeoHead";

type FormData = {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  eventType: string;
  expectedEventsPerYear: string;
  message: string;
  website: string;
};

const INITIAL_FORM: FormData = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  eventType: "exhibition",
  expectedEventsPerYear: "2-5",
  message: "",
  website: "",
};

const EVENT_TYPES = [
  { value: "exhibition", label: "Exhibition" },
  { value: "trade_show", label: "Trade show" },
  { value: "expo", label: "Expo" },
  { value: "conference", label: "Conference" },
  { value: "fair", label: "Fair" },
  { value: "other", label: "Other" },
];

const VOLUME_OPTIONS = ["1", "2-5", "6-10", "11-25", "25+"];

export default function OrganizerDemo() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const utm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") ?? "",
      utmMedium: params.get("utm_medium") ?? "",
      utmCampaign: params.get("utm_campaign") ?? "",
      utmTerm: params.get("utm_term") ?? "",
      utmContent: params.get("utm_content") ?? "",
    };
  }, []);

  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (form.name.trim().length < 2 || form.companyName.trim().length < 2) {
      setError("Please enter your name and organization.");
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid work email.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.post("/api/public/demo-requests", {
        ...form,
        source: "organizer_landing_page",
        ...utm,
      });
      setSubmitted(true);
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SeoHead title="Book an ExhibitTix Demo | Exhibition Management Platform" description="Talk to the ExhibitTix team about managing your exhibitions, venues, stalls, exhibitors, visitors, ticketing, check-in and leads." canonicalUrl="/organizer-demo" robots="noindex,nofollow" />
      <Header />
      <main>
        <section className="bg-slate-950 text-white">
          <div className="container mx-auto grid gap-10 px-4 py-14 md:py-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <Link to="/organizers" className="text-sm text-white/60 hover:text-white">← Back to Organizer Platform</Link>
              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-primary">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                ORGANIZER DEMO
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                See how ExhibitTix can run your next event.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/65 md:text-lg">
                Tell us a little about your organization and event portfolio. We'll tailor the walkthrough around the workflows that matter to your team.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  ["One connected workflow", "Events, venues, stalls, exhibitors, visitors and leads stay connected."],
                  ["Operational visibility", "See ticketing, attendance, occupancy, revenue and engagement in one place."],
                  ["Built for real teams", "Explore workflows for organizers and the people operating the event with you."],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-semibold">{title}</div>
                      <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl md:p-8">
              {submitted ? (
                <div className="flex min-h-[440px] flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden="true" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold">Demo request received.</h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    Thanks for reaching out. Our team will review your requirements and contact you about the next step.
                  </p>
                  <Button asChild variant="outline" className="mt-7">
                    <Link to="/organizers">Back to Organizer Platform</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <div>
                    <h2 className="text-xl font-semibold">Book a personalized demo</h2>
                    <p className="mt-1 text-sm text-muted-foreground">A few details help us make the walkthrough relevant.</p>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="demo-name">Your name</Label>
                      <Input id="demo-name" className="mt-1.5" value={form.name} onChange={(e) => setField("name", e.target.value)} autoComplete="name" required />
                    </div>
                    <div>
                      <Label htmlFor="demo-company">Organization</Label>
                      <Input id="demo-company" className="mt-1.5" value={form.companyName} onChange={(e) => setField("companyName", e.target.value)} autoComplete="organization" required />
                    </div>
                    <div>
                      <Label htmlFor="demo-email">Work email</Label>
                      <Input id="demo-email" className="mt-1.5" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} autoComplete="email" required />
                    </div>
                    <div>
                      <Label htmlFor="demo-phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
                      <Input id="demo-phone" className="mt-1.5" value={form.phone} onChange={(e) => setField("phone", e.target.value)} autoComplete="tel" />
                    </div>
                    <div>
                      <Label htmlFor="demo-event-type">Event type</Label>
                      <Select value={form.eventType} onValueChange={(value) => setField("eventType", value)}>
                        <SelectTrigger id="demo-event-type" className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="demo-volume">Events per year</Label>
                      <Select value={form.expectedEventsPerYear} onValueChange={(value) => setField("expectedEventsPerYear", value)}>
                        <SelectTrigger id="demo-volume" className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VOLUME_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item} {item === "1" ? "event" : "events"}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Label htmlFor="demo-message">What would you like to manage?</Label>
                    <Textarea id="demo-message" className="mt-1.5" rows={4} value={form.message} onChange={(e) => setField("message", e.target.value)} placeholder="Tell us about your events, venue/stall setup, ticketing or lead workflow." />
                  </div>

                  <div className="hidden" aria-hidden="true">
                    <Label htmlFor="demo-website">Website</Label>
                    <Input id="demo-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setField("website", e.target.value)} />
                  </div>

                  {error && (
                    <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <Button type="submit" size="lg" className="mt-5 w-full gap-2" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    {submitting ? "Sending request…" : "Request a Demo"}
                  </Button>

                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" aria-hidden="true" /> No commitment required</span>
                    <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Built for event teams</span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card">
          <div className="container mx-auto grid gap-4 px-4 py-8 sm:grid-cols-3">
            {[
              ["Event setup", "Plan your event and venue structure."],
              ["Operations", "Run exhibitors, stalls, tickets and check-in."],
              ["Growth", "Capture leads and understand performance."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-border p-4">
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-4 py-12 md:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <Phone className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-2xl font-bold">Prefer to talk first?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You can also reach the ExhibitTix team through the existing support channels.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
