import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Phone, Mail, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { LoadingState } from "@/components/ui/loading-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import StallFloorPlan from "@/components/StallFloorPlan";
import { usePublicExhibition, usePublicExhibitionExhibitors } from "@/hooks/usePublicExhibitions";
import { useAuth } from "@/hooks/useAuth";
import { useApplyToExhibition } from "@/hooks/exhibitor/useParticipations";
import { toast } from "sonner";
import { EventHero } from "@/components/exhibition/EventHero";
import { EventHighlights } from "@/components/exhibition/EventHighlights";
import { AboutExhibition } from "@/components/exhibition/AboutExhibition";
import { WhatToExpect } from "@/components/exhibition/WhatToExpect";
import { WhoShouldAttend } from "@/components/exhibition/WhoShouldAttend";
import { EventScheduleSection } from "@/components/exhibition/EventScheduleSection";
import { VenueInfo } from "@/components/exhibition/VenueInfo";
import { EventGallery } from "@/components/exhibition/EventGallery";
import { ExhibitorDirectory } from "@/components/exhibition/ExhibitorDirectory";
import { OrganizerCard } from "@/components/exhibition/OrganizerCard";
import { RefundPolicySection } from "@/components/exhibition/RefundPolicySection";
import { EventFAQ } from "@/components/exhibition/EventFAQ";
import { RelatedExhibitions } from "@/components/exhibition/RelatedExhibitions";
import { TicketPurchaseCard } from "@/components/exhibition/TicketPurchaseCard";

const ExhibitionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const applyToExhibition = useApplyToExhibition();

  const { data: exhibition, isLoading } = usePublicExhibition(id);
  // Also backs EventHighlights' "confirmed exhibitors" count — react-query
  // dedupes this against ExhibitorDirectory's own page-1 fetch of the same
  // query key, so this never becomes a duplicate network request.
  const { data: exhibitorsPage } = usePublicExhibitionExhibitors(id, 1);

  // Phase 23.1 — dynamic per-event page title (a real, evidence-based gap:
  // this project has no react-helmet/SSR meta-tag infrastructure at all, so
  // a full Open Graph/structured-data pass is documented as future work
  // rather than introduced here). document.title alone still meaningfully
  // improves the browser tab and back-navigation legibility for a visitor
  // with several event tabs open, at zero new dependency cost. Restored on
  // unmount so navigating elsewhere doesn't leave a stale title behind.
  useEffect(() => {
    if (!exhibition) return;
    const previousTitle = document.title;
    document.title = `${exhibition.name} | ExhibitTix`;
    return () => {
      document.title = previousTitle;
    };
  }, [exhibition]);

  // Phase 23.2 — per-event canonical/Open Graph/JSON-LD. index.html ships
  // static, homepage-only versions of these tags (confirmed by audit: every
  // route previously advertised the same canonical URL and OG description,
  // which is actively harmful for a page meant to be shared/indexed
  // individually). This overrides the existing tags in place — same
  // zero-dependency, save-and-restore pattern as the document.title effect
  // above — rather than appending duplicate tags or adding react-helmet.
  // The JSON-LD block has no static counterpart, so it's inserted/removed
  // wholesale instead.
  useEffect(() => {
    if (!exhibition) return;
    const url = window.location.href;
    const setMeta = (selector: string, attr: "content" | "href", value: string) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const previous = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return { el, attr, previous } as const;
    };
    const restores = [
      setMeta('link[rel="canonical"]', "href", url),
      setMeta('meta[property="og:title"]', "content", exhibition.name),
      setMeta(
        'meta[property="og:description"]',
        "content",
        exhibition.description || `${exhibition.name} — book tickets on ExhibitTix.`
      ),
      setMeta('meta[property="og:url"]', "content", url),
      exhibition.coverImageUrl ? setMeta('meta[property="og:image"]', "content", exhibition.coverImageUrl) : null,
      setMeta('meta[property="og:type"]', "content", "event"),
    ].filter((r): r is { el: Element; attr: "content" | "href"; previous: string | null } => r !== null);

    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "exhibition-jsonld";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name: exhibition.name,
      startDate: exhibition.startDate ?? undefined,
      endDate: exhibition.endDate ?? undefined,
      // schema.org has no "completed" event status — a past event that ran
      // normally is still EventScheduled; only cancellation/postponement/etc
      // get their own status, none of which this app tracks.
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: exhibition.venue || undefined,
        address: exhibition.city || undefined,
      },
      image: exhibition.coverImageUrl || undefined,
      description: exhibition.description || undefined,
      url,
      offers: (exhibition.ticketTypes ?? []).map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: Number(t.price),
        priceCurrency: "INR",
        availability:
          (t.remaining ?? t.quantity) > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        url,
      })),
    });
    document.head.appendChild(ld);

    return () => {
      for (const { el, attr, previous } of restores) {
        if (previous === null) el.removeAttribute(attr);
        else el.setAttribute(attr, previous);
      }
      ld.remove();
    };
  }, [exhibition]);

  // Anyone signed up on the exhibitor side may apply — a brand-new account
  // with no business/membership yet still gets one bootstrapped on submit
  // (see POST /api/exhibitor/participations). This is a UX gate only; the
  // server is the real permission boundary.
  const canApply =
    !user || user.userType === "exhibitor" || (user.roles?.exhibitor.length ?? 0) > 0;

  const handleApply = () => {
    if (!user) {
      toast.error("Please sign in as an exhibitor to apply");
      navigate("/auth");
      return;
    }
    if (!exhibition) return;
    applyToExhibition.mutate(exhibition.id, {
      onSuccess: () => toast.success("Application submitted. Track its status from My Participations."),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to apply"),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState label="Loading exhibition..." />
        <Footer />
      </div>
    );
  }

  if (!exhibition) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-20 text-center">
          <h1 className="font-display text-3xl mb-4">Exhibition Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The exhibition you're looking for doesn't exist.
          </p>
          <Link to="/exhibitions">
            <Button>Browse Exhibitions</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Phase 23.2 — the audit found no page-level status ever surfaced to the
  // visitor (the raw `status` enum was only ever used as a server-side query
  // filter). `status` itself only distinguishes draft/live/paused/completed
  // (see schema.prisma) and this endpoint only ever returns live or
  // completed events, so "upcoming" vs "ongoing" is derived from the real
  // startDate/endDate against the current time — no new status values
  // invented.
  const isCompleted = exhibition.status === "completed";
  const now = Date.now();
  const startTime = exhibition.startDate ? new Date(exhibition.startDate).getTime() : null;
  const endTime = exhibition.endDate ? new Date(exhibition.endDate).getTime() : null;
  const eventPhaseLabel = isCompleted
    ? "Completed"
    : startTime !== null && now < startTime
    ? "Upcoming"
    : endTime !== null && now > endTime
    ? "Completed"
    : "Ongoing";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="bg-secondary/30 py-3">
        <div className="container mx-auto">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/exhibitions">Exhibitions</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{exhibition.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content — each section owns its own heading/spacing rather
              than being wrapped in a uniform white card, per the redesign
              direction away from "card → card → card". A border-t between
              sections gives real vertical rhythm without another box. */}
          <div className="lg:col-span-2 min-w-0 [&>*]:pb-8 [&>*+*]:pt-8 [&>*+*]:border-t [&>*+*]:border-border/60">
            <EventHero exhibition={exhibition} eventPhaseLabel={eventPhaseLabel} isCompleted={isCompleted} />

            <EventHighlights exhibition={exhibition} confirmedExhibitorCount={exhibitorsPage?.total ?? 0} />

            <AboutExhibition description={exhibition.description} />

            <WhatToExpect highlights={exhibition.highlights} />

            <WhoShouldAttend audiences={exhibition.audiences} />

            <EventScheduleSection schedule={exhibition.schedules} />

            <VenueInfo
              venue={exhibition.venue}
              city={exhibition.city}
              latitude={exhibition.latitude}
              longitude={exhibition.longitude}
            />

            <EventGallery media={exhibition.media} exhibitionName={exhibition.name} />

            {(exhibition.stalls ?? []).length > 0 && (
              <div>
                <h2 className="font-display text-xl font-semibold mb-3">Exhibitor Stall Layout</h2>
                <StallFloorPlan
                  exhibitionId={exhibition.id}
                  exhibitionTitle={exhibition.name}
                  stalls={exhibition.stalls ?? []}
                  canApply={canApply}
                  onApply={canApply ? handleApply : undefined}
                  applyPending={applyToExhibition.isPending}
                />
              </div>
            )}

            {id && <ExhibitorDirectory exhibitionId={id} />}

            {exhibition.organizer && <OrganizerCard organizer={exhibition.organizer} />}

            <RefundPolicySection refundPolicy={exhibition.refundPolicy} terms={exhibition.terms} />

            <EventFAQ faqs={exhibition.faqs} />
          </div>

          {/* Sidebar - Ticket Selection */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <TicketPurchaseCard exhibition={exhibition} isCompleted={isCompleted} />

              {/* Exhibitor CTA */}
              {canApply && !isCompleted && (
                <Card className="mt-4 p-4 border-primary/20 bg-primary/5">
                  <h4 className="font-semibold mb-2">Are you an Exhibitor?</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Apply to exhibit — the organizer will review your application, and you'll pick a stall once approved.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleApply}
                    disabled={applyToExhibition.isPending}
                  >
                    <Building2 className="w-4 h-4" />
                    {applyToExhibition.isPending ? "Applying..." : "Apply to Exhibit"}
                  </Button>
                </Card>
              )}

              {/* Help Card */}
              <Card className="mt-4 p-4">
                <h4 className="font-semibold mb-3">Need Help?</h4>
                <div className="space-y-2">
                  <a
                    href="tel:+918001234567"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="w-4 h-4" />
                    +91 800-123-4567
                  </a>
                  <a
                    href="mailto:support@exhibittix.com"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="w-4 h-4" />
                    support@exhibittix.com
                  </a>
                </div>
              </Card>
            </div>
          </div>
        </div>

        <div className="mt-14 pt-10 border-t border-border/60">
          <RelatedExhibitions
            currentExhibitionId={exhibition.id}
            category={exhibition.category}
            city={exhibition.city}
          />
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ExhibitionDetail;
