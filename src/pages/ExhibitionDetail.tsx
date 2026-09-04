import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Share2,
  Heart,
  Check,
  Info,
  Phone,
  Mail,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import StallFloorPlan from "@/components/StallFloorPlan";
import { usePublicExhibition } from "@/hooks/usePublicExhibitions";
import { getMinTicketPrice } from "@/components/ExhibitionCard";
import { useAuth } from "@/hooks/useAuth";
import { useApplyToExhibition } from "@/hooks/exhibitor/useParticipations";
import { toast } from "sonner";

const ExhibitionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const applyToExhibition = useApplyToExhibition();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  const { data: exhibition, isLoading } = usePublicExhibition(id);
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
        <div className="container mx-auto py-20 text-center text-muted-foreground">Loading...</div>
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "TBA";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const minPrice = getMinTicketPrice(exhibition);
  const ticketTypes = exhibition.ticketTypes ?? [];

  const handleBookNow = () => {
    if (selectedTicket) {
      navigate(`/book/${exhibition.id}?ticket=${selectedTicket}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Breadcrumb */}
      <div className="bg-secondary/30 py-3">
        <div className="container mx-auto">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Home
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link to="/exhibitions" className="text-muted-foreground hover:text-foreground">
              Exhibitions
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground">{exhibition.name}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Cover image */}
            <div className="relative rounded-2xl overflow-hidden">
              <div className="aspect-video relative bg-muted">
                {exhibition.coverImageUrl && (
                  <img
                    src={exhibition.coverImageUrl}
                    alt={exhibition.name}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
              </div>
            </div>

            {/* Title & Meta */}
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {exhibition.category && <Badge variant="accent">{exhibition.category}</Badge>}
              </div>

              <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2">
                {exhibition.name}
              </h1>
              {exhibition.description && (
                <p className="text-xl text-muted-foreground">{exhibition.description}</p>
              )}

              <div className="flex flex-wrap gap-4 mt-6">
                <Button variant="outline" size="sm" className="gap-2">
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Heart className="w-4 h-4" />
                  Save
                </Button>
              </div>
            </div>

            {/* Quick Info Cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">
                      {formatDate(exhibition.startDate)} - {formatDate(exhibition.endDate)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{exhibition.city}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* About */}
            {exhibition.description && (
              <Card>
                <CardHeader>
                  <CardTitle>About This Exhibition</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{exhibition.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Venue */}
            <Card>
              <CardHeader>
                <CardTitle>Venue Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{exhibition.venue}</h4>
                    <p className="text-muted-foreground text-sm">{exhibition.city}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stall Floor Plan */}
            {(exhibition.stalls ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Exhibitor Stall Layout</CardTitle>
                </CardHeader>
                <CardContent>
                  <StallFloorPlan
                    exhibitionId={exhibition.id}
                    exhibitionTitle={exhibition.name}
                    stalls={exhibition.stalls ?? []}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - Ticket Selection */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <Card className="overflow-hidden">
                <div className="gradient-hero p-6">
                  <p className="text-card/70 text-sm mb-1">Tickets from</p>
                  <p className="text-3xl font-bold text-card">
                    ₹{minPrice.toLocaleString("en-IN")}
                  </p>
                </div>

                <CardContent className="p-6">
                  <h3 className="font-display text-lg mb-4">Select Ticket Type</h3>

                  <div className="space-y-3 mb-6">
                    {ticketTypes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No tickets available yet.</p>
                    )}
                    {ticketTypes.map((ticket) => {
                      const price = Number(ticket.price);
                      const available = ticket.quantity > 0;
                      return (
                        <div
                          key={ticket.id}
                          onClick={() => available && setSelectedTicket(ticket.id)}
                          className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                            selectedTicket === ticket.id
                              ? "border-primary bg-primary/5"
                              : available
                              ? "border-border hover:border-primary/50"
                              : "border-border opacity-60 cursor-not-allowed"
                          }`}
                        >
                          {selectedTicket === ticket.id && (
                            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-4 h-4 text-primary-foreground" />
                            </div>
                          )}

                          <h4 className="font-semibold mb-2">{ticket.name}</h4>

                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-xl font-bold">₹{price.toLocaleString("en-IN")}</span>
                          </div>

                          {!available && (
                            <Badge variant="destructive" className="mt-3">
                              Sold Out
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!selectedTicket}
                    onClick={handleBookNow}
                  >
                    {selectedTicket ? "Continue to Book" : "Select a Ticket"}
                  </Button>

                  <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Instant confirmation. Free cancellation up to 24 hours before the event.
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Exhibitor CTA */}
              {canApply && (
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
      </div>

      <Footer />
    </div>
  );
};

export default ExhibitionDetail;
