import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  Map,
  QrCode,
  ScanLine,
  Ticket,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import SeoHead from "@/components/SeoHead";

const capabilities = [
  {
    icon: CalendarDays,
    eyebrow: "01",
    title: "Event Management",
    description:
      "Create, publish and manage every event from one organizer workspace. Keep event details, modules, teams and operational settings connected.",
    bullets: ["Event creation and publishing", "Event status and configuration", "Organizer team access"],
  },
  {
    icon: Map,
    eyebrow: "02",
    title: "Venue & Stall Management",
    description:
      "Turn halls and floor plans into structured, sellable inventory. See availability, pricing, reservations and occupancy in one place.",
    bullets: ["Halls and interactive floor plans", "Stall inventory and pricing", "Reservations and allocation"],
    featured: true,
  },
  {
    icon: Building2,
    eyebrow: "03",
    title: "Exhibitor Management",
    description:
      "Manage the exhibitor journey from application and participation through stall allocation, payments and ongoing communication.",
    bullets: ["Applications and approvals", "Participation and allocation", "Payments and exhibitor records"],
  },
  {
    icon: Ticket,
    eyebrow: "04",
    title: "Visitor & Ticketing",
    description:
      "Give visitors a simple path from registration to payment, QR ticket and venue entry while keeping capacity and ticket data synchronized.",
    bullets: ["Registration and ticket types", "Orders and payments", "QR tickets and check-in"],
  },
  {
    icon: Users,
    eyebrow: "05",
    title: "Lead Management",
    description:
      "Connect visitor interactions with exhibitors so valuable conversations become trackable leads instead of disappearing after the event.",
    bullets: ["Visitor-to-exhibitor interactions", "Lead capture and qualification", "Follow-up visibility"],
  },
  {
    icon: BarChart3,
    eyebrow: "06",
    title: "Analytics",
    description:
      "Understand how the exhibition is performing across registrations, ticket sales, revenue, occupancy, attendance and leads.",
    bullets: ["Registration and attendance", "Revenue and ticket sales", "Occupancy and lead performance"],
  },
];

const lifecycle = [
  "Plan event",
  "Configure venue",
  "Sell stalls",
  "Manage exhibitors",
  "Sell tickets",
  "Check in visitors",
  "Capture leads",
  "Measure results",
];

const faqs = [
  {
    question: "Who is ExhibitTix built for?",
    answer:
      "ExhibitTix is designed for exhibition organizers and event teams managing exhibitions, trade shows and similar multi-participant events.",
  },
  {
    question: "Can I manage halls and exhibition stalls?",
    answer:
      "Yes. The organizer platform supports halls, floor plans, stall inventory, pricing, availability, reservations and allocation workflows.",
  },
  {
    question: "Can exhibitors manage their own participation?",
    answer:
      "Yes. Exhibitors can have a dedicated workflow for participation, stall booking, payments, representatives, leads and performance information.",
  },
  {
    question: "Does ExhibitTix support visitor ticketing and QR check-in?",
    answer:
      "Yes. The platform connects visitor registration, ticket types, orders, payments, QR tickets and event check-in.",
  },
  {
    question: "What can I see in organizer analytics?",
    answer:
      "Organizer reporting is designed around registrations, ticket sales, revenue, refunds, stall occupancy, attendance, leads and exhibitor performance.",
  },
];

function OrganizerDashboardPreview() {
  return (
    <div
      className="relative rounded-2xl border border-white/15 bg-slate-950/95 p-3 shadow-2xl md:p-4"
      aria-label="Illustration of the ExhibitTix organizer dashboard"
    >
      <div className="rounded-xl border border-white/10 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="text-[10px] font-medium text-white/50">ORGANIZER WORKSPACE</div>
              <div className="text-xs font-semibold text-white">Organizer event dashboard</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
            Published
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          {[
            ["Registrations", "Live"],
            ["Ticket sales", "Live"],
            ["Occupancy", "Live"],
            ["Leads", "Live"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[9px] text-white/45">{label}</div>
              <div className="mt-1 text-sm font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 p-3 pt-0 md:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-medium text-white/70">Ticket sales</span>
              <LineChart className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </div>
            <div className="flex h-28 items-end gap-1.5">
              {[35, 44, 38, 58, 52, 72, 68, 84, 77, 94, 88, 100].map((height, index) => (
                <div
                  key={index}
                  className="flex-1 rounded-t-sm bg-primary/80"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-medium text-white/70">Floor plan</span>
              <Map className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 16 }).map((_, index) => (
                <div
                  key={index}
                  className={`aspect-square rounded-sm border text-[7px] flex items-center justify-center ${
                    [1, 2, 5, 6, 9, 10, 14].includes(index)
                      ? "border-primary/40 bg-primary/20 text-primary"
                      : "border-white/10 bg-white/[0.03] text-white/35"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[8px] text-white/45">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/70" />Booked</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white/10" />Available</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapabilityPreview({ index }: { index: number }) {
  if (index === 1) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold">Hall · Floor Plan</div>
            <div className="text-[10px] text-muted-foreground">Stall inventory · Live</div>
          </div>
          <Map className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className={`aspect-square rounded border text-[8px] flex items-center justify-center ${
                [2, 3, 7, 8, 9, 13, 14, 15, 18, 19, 21, 22].includes(i)
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 3) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <QrCode className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs font-semibold">Visitor ticket</div>
            <div className="text-[10px] text-muted-foreground">Ticket status · Ready for entry</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted p-2"><div className="text-sm font-semibold">1</div><div className="text-[9px] text-muted-foreground">Ticket</div></div>
          <div className="rounded-lg bg-muted p-2"><div className="text-sm font-semibold">QR</div><div className="text-[9px] text-muted-foreground">Entry</div></div>
          <div className="rounded-lg bg-muted p-2"><div className="text-sm font-semibold">Live</div><div className="text-[9px] text-muted-foreground">Status</div></div>
        </div>
      </div>
    );
  }

  if (index === 4) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold">Lead pipeline</span>
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        {["New lead", "Qualified", "Follow-up"].map((label) => (
          <div key={label} className="mb-2 flex items-center justify-between rounded-lg bg-muted/70 p-2.5 last:mb-0">
            <span className="text-[10px] font-medium">{label}</span>
            <span className="text-xs font-semibold text-muted-foreground">Tracked</span>
          </div>
        ))}
      </div>
    );
  }

  if (index === 5) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold">Event performance</span>
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          {[
            ["Attendance", "Tracked"],
            ["Stall occupancy", "Tracked"],
            ["Lead capture", "Tracked"],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[10px]"><span>{label}</span><span className="font-semibold">{value}</span></div>
              <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: value === "Tracked" ? "72%" : "64%" }} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="grid grid-cols-3 gap-2">
        {[
          { Icon: CalendarDays, label: "Events", value: "Live" },
          { Icon: Building2, label: "Exhibitors", value: "Live" },
          { Icon: WalletCards, label: "Revenue", value: "Live" },
        ].map(({ Icon, label, value }) => (
          <div key={String(label)} className="rounded-xl bg-muted/60 p-3">
            <Icon className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
            <div className="text-[9px] text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Organizers() {
  return (
    <div className="min-h-screen bg-background">
      <SeoHead title="Exhibition Management Software for Organizers | ExhibitTix" description="Manage exhibitions, venues, stalls, exhibitors, visitors, ticketing, check-in, leads and analytics from one platform with ExhibitTix." canonicalUrl="/organizers" ogTitle="Exhibition Management Software for Organizers | ExhibitTix" ogDescription="Everything you need to plan, operate and measure your next exhibition." />
      <Header />

      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.18),transparent_34%),radial-gradient(circle_at_85%_55%,hsl(var(--primary)/0.10),transparent_30%)]" />
          <div className="container relative mx-auto grid items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[.9fr_1.1fr] lg:py-28">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-primary">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                BUILT FOR EXHIBITION ORGANIZERS
              </div>
              <h1 className="max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
                Everything you need to run a successful exhibition.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/65 md:text-lg">
                Manage events, venues, stalls, exhibitors, visitors, tickets, payments, check-ins and leads from one connected platform.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-2 shadow-accent">
                  <Link to="/organizer-demo">
                    Book a Demo
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  <a href="#platform">Explore the Platform</a>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
                {["Events", "Stalls", "Exhibitors", "Ticketing", "Leads", "Analytics"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="lg:pl-4">
              <OrganizerDashboardPreview />
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-card">
          <div className="container mx-auto grid gap-0 px-4 md:grid-cols-3">
            {[
              ["One platform", "Keep the entire exhibition operation connected."],
              ["Organizer-first", "Built around the workflows your team actually runs."],
              ["Business visibility", "Measure sales, occupancy, attendance and leads."],
            ].map(([title, description], index) => (
              <div key={title} className={`px-5 py-7 md:py-8 ${index > 0 ? "border-t md:border-l md:border-t-0 border-border" : ""}`}>
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-padding">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Built around the organizer</p>
              <h2 className="section-title">Running an exhibition shouldn't mean managing everything manually.</h2>
              <p className="section-subtitle">
                Replace disconnected spreadsheets, forms, payment tools and visitor workflows with one operational system.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                [ClipboardList, "Disconnected workflows", "Event data gets spread across spreadsheets, forms and multiple tools."],
                [Map, "Complex stall operations", "Availability, reservations, pricing and allocation need to stay synchronized."],
                [Users, "Exhibitor follow-up", "Applications, participation, payments and communication need constant visibility."],
                [ScanLine, "Lost engagement data", "Visitor interactions and leads should remain useful after the event."],
              ].map(([Icon, title, description]) => (
                <div key={String(title)} className="card-premium p-5">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold">{String(title)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(description)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="scroll-mt-20 bg-muted/35">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">The ExhibitTix platform</p>
              <h2 className="section-title">One connected exhibition lifecycle.</h2>
              <p className="section-subtitle">
                Every operational layer stays connected, from the first event setup to post-event lead and performance analysis.
              </p>
            </div>

            <div className="mt-12 space-y-16 md:mt-16">
              {capabilities.map((capability, index) => {
                const Icon = capability.icon;
                const reversed = index % 2 === 1;
                return (
                  <div
                    key={capability.title}
                    className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${reversed ? "lg:[&>*:first-child]:order-2" : ""}`}
                  >
                    <div>
                      <div className="mb-4 flex items-center gap-3">
                        <span className="text-xs font-semibold tracking-[0.16em] text-primary">{capability.eyebrow}</span>
                        <span className="h-px w-8 bg-primary/30" />
                        {capability.featured && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                            CORE WORKFLOW
                          </span>
                        )}
                      </div>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                      </div>
                      <h3 className="text-2xl font-bold md:text-3xl">{capability.title}</h3>
                      <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">{capability.description}</p>
                      <ul className="mt-6 space-y-3">
                        {capability.bullets.map((bullet) => (
                          <li key={bullet} className="flex items-start gap-2.5 text-sm">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <CapabilityPreview index={index} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section-padding">
          <div className="container mx-auto px-4">
            <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:items-center">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">From planning to measurement</p>
                <h2 className="section-title text-left">Your entire exhibition, connected.</h2>
                <p className="text-muted-foreground text-lg leading-7">
                  The value is not just in individual features. It is in keeping the event, venue, exhibitors, visitors and engagement data connected.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {lifecycle.map((item, index) => (
                  <div key={item} className="relative rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="text-sm font-semibold">{item}</div>
                    {index < lifecycle.length - 1 && (
                      <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 bg-background text-muted-foreground lg:block" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 text-white">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Business visibility</p>
              <h2 className="text-3xl font-bold tracking-tight md:text-5xl">Know what happened at your exhibition.</h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60">
                See the numbers that matter to an organizer, without stitching reports together after the event.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Registrations", "Visitor demand"],
                ["Ticket sales", "Sales performance"],
                ["Revenue", "Financial view"],
                ["Stall occupancy", "Space utilization"],
                ["Attendance", "Actual footfall"],
                ["Leads", "Engagement captured"],
                ["Exhibitor performance", "Participation insight"],
                ["Refunds", "Financial reconciliation"],
              ].map(([metric, detail]) => (
                <div key={metric} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm font-semibold">{metric}</div>
                  <div className="mt-1 text-xs text-white/45">{detail}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-padding">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Why ExhibitTix</p>
              <h2 className="section-title">Built around the way exhibitions actually work.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                ["One operational platform", "Keep planning, exhibitors, visitors and event operations in one system."],
                ["Interactive stall management", "Treat exhibition space as structured inventory, not a spreadsheet."],
                ["Connected visitor journey", "Registration, payment, QR ticket and check-in stay linked."],
                ["Exhibitor-first workflows", "Manage participation, allocation, payments and engagement together."],
                ["Actionable analytics", "Separate revenue, refunds, occupancy, attendance and lead performance."],
                ["Built to grow", "Support multiple events and an expanding organizer operation."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-border bg-card p-6">
                  <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-base font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted/35">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Questions</p>
                <h2 className="section-title">What organizers usually want to know.</h2>
              </div>
              <div className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {faqs.map((faq) => (
                  <details key={faq.question} className="group p-5 md:p-6">
                    <summary className="cursor-pointer list-none pr-8 text-sm font-semibold marker:hidden">
                      {faq.question}
                    </summary>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-accent md:px-12">
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full border border-white/10" aria-hidden="true" />
            <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight md:text-5xl">See what your next exhibition could look like.</h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-primary-foreground/80 md:text-base">
                Get a personalized walkthrough of ExhibitTix and see how your event operations can work from one platform.
              </p>
              <Button asChild size="lg" variant="secondary" className="mt-8 gap-2">
                <Link to="/organizer-demo">
                  Book a Demo
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
