import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Clock,
  Star,
  Users,
  ChevronLeft,
  ChevronRight,
  Share2,
  Heart,
  Check,
  Info,
  Phone,
  Mail,
  ExternalLink,
  PlayCircle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getExhibitionById } from "@/data/exhibitions";

const ExhibitionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  const exhibition = getExhibitionById(id || "");

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % exhibition.images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + exhibition.images.length) % exhibition.images.length
    );
  };

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
            <span className="text-foreground">{exhibition.title}</span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Image Gallery */}
            <div className="relative rounded-2xl overflow-hidden">
              <div className="aspect-video relative">
                <img
                  src={exhibition.images[currentImageIndex]}
                  alt={exhibition.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />

                {/* Gallery Controls */}
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {/* Image Counter */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {exhibition.images.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentImageIndex
                          ? "bg-card w-6"
                          : "bg-card/50 hover:bg-card/80"
                      }`}
                    />
                  ))}
                </div>

                {/* Play Button (Promo Video) */}
                <button className="absolute bottom-4 right-4 flex items-center gap-2 bg-card/90 backdrop-blur-sm px-4 py-2 rounded-full hover:bg-card transition-colors">
                  <PlayCircle className="w-5 h-5 text-accent" />
                  <span className="text-sm font-medium">Watch Promo</span>
                </button>
              </div>

              {/* Thumbnail Strip */}
              <div className="flex gap-2 p-2 bg-muted">
                {exhibition.images.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`relative w-20 h-14 rounded overflow-hidden ${
                      index === currentImageIndex
                        ? "ring-2 ring-primary"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Title & Meta */}
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Badge variant="accent">{exhibition.category}</Badge>
                <div className="flex items-center gap-1 text-accent">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="font-semibold">{exhibition.rating}</span>
                  <span className="text-muted-foreground">
                    ({exhibition.reviews.toLocaleString()} reviews)
                  </span>
                </div>
              </div>

              <h1 className="font-display text-3xl md:text-4xl text-foreground mb-2">
                {exhibition.title}
              </h1>
              <p className="text-xl text-muted-foreground">{exhibition.subtitle}</p>

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
            <div className="grid sm:grid-cols-3 gap-4">
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
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Timing</p>
                    <p className="font-medium text-sm">{exhibition.timing}</p>
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
            <Card>
              <CardHeader>
                <CardTitle>About This Exhibition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none text-muted-foreground">
                  {exhibition.fullDescription.split("\n\n").map((para, index) => (
                    <p key={index} className="mb-4">
                      {para}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Venue */}
            <Card>
              <CardHeader>
                <CardTitle>Venue Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{exhibition.venue}</h4>
                    <p className="text-muted-foreground text-sm">{exhibition.venueAddress}</p>
                  </div>
                </div>
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(
                      exhibition.venue + ", " + exhibition.city
                    )}`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Organizer */}
            <Card>
              <CardHeader>
                <CardTitle>Organized By</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl">
                    {exhibition.organizer.logo}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {exhibition.organizer.name}
                    </h4>
                    <p className="text-muted-foreground text-sm">
                      {exhibition.organizer.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQs */}
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {exhibition.faqs.map((faq, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Ticket Selection */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <Card className="overflow-hidden">
                <div className="gradient-hero p-6">
                  <p className="text-card/70 text-sm mb-1">Tickets from</p>
                  <p className="text-3xl font-bold text-card">
                    ₹{exhibition.priceRange.min.toLocaleString("en-IN")}
                  </p>
                </div>

                <CardContent className="p-6">
                  <h3 className="font-display text-lg mb-4">Select Ticket Type</h3>

                  <div className="space-y-3 mb-6">
                    {exhibition.tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        onClick={() => ticket.available && setSelectedTicket(ticket.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedTicket === ticket.id
                            ? "border-primary bg-primary/5"
                            : ticket.available
                            ? "border-border hover:border-primary/50"
                            : "border-border opacity-60 cursor-not-allowed"
                        }`}
                      >
                        {selectedTicket === ticket.id && (
                          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}

                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-semibold">{ticket.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {ticket.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-xl font-bold">
                            ₹{ticket.price.toLocaleString("en-IN")}
                          </span>
                          {ticket.originalPrice && (
                            <span className="text-sm text-muted-foreground line-through">
                              ₹{ticket.originalPrice.toLocaleString("en-IN")}
                            </span>
                          )}
                        </div>

                        <ul className="space-y-1">
                          {ticket.benefits.slice(0, 3).map((benefit, index) => (
                            <li
                              key={index}
                              className="text-sm text-muted-foreground flex items-center gap-2"
                            >
                              <Check className="w-3 h-3 text-primary" />
                              {benefit}
                            </li>
                          ))}
                        </ul>

                        {!ticket.available && (
                          <Badge variant="destructive" className="mt-3">
                            Sold Out
                          </Badge>
                        )}
                      </div>
                    ))}
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
              <Card className="mt-4 p-4 border-primary/20 bg-primary/5">
                <h4 className="font-semibold mb-2">Are you an Exhibitor?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Book a stall and showcase your products at this exhibition
                </p>
                <Link to={`/book-stall/${exhibition.id}`}>
                  <Button variant="outline" className="w-full gap-2">
                    <Building2 className="w-4 h-4" />
                    Book a Stall
                  </Button>
                </Link>
              </Card>

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
