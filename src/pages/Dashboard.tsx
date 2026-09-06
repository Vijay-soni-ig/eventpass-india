import { useState } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Ticket,
  Calendar,
  MapPin,
  HelpCircle,
  LogOut,
  Mail,
  Phone,
  Bookmark,
  BookmarkX,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useSavedExhibitionsList, useSaveExhibition, type SavedExhibitionEntry } from "@/hooks/useSavedExhibitions";

// Phase 23.3 — one card per saved event. A dedicated component (not inlined
// in the .map) so its own useSaveExhibition (for the Remove action) is a
// proper per-item hook call, not one hidden inside a loop body.
function SavedEventCard({ entry }: { entry: SavedExhibitionEntry }) {
  const { unsave } = useSaveExhibition(entry.exhibition.id);
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "TBA";
    return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  if (!entry.available) {
    return (
      <Card className="p-4 flex items-center justify-between gap-4 opacity-75">
        <p className="text-sm text-muted-foreground">This event is no longer available.</p>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-destructive shrink-0"
          onClick={() => unsave.mutate()}
          disabled={unsave.isPending}
          aria-label="Remove event from saved events"
        >
          <BookmarkX className="w-4 h-4" />
          Remove
        </Button>
      </Card>
    );
  }

  const exhibition = entry.exhibition;
  const isCompleted = exhibition.status === "completed";
  const ticketTypes = exhibition.ticketTypes ?? [];
  const anyAvailable = ticketTypes.length === 0 ? true : ticketTypes.some((t) => (t.remaining ?? t.quantity) > 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {exhibition.coverImageUrl && (
          <div className="sm:w-1/4 shrink-0">
            <img src={exhibition.coverImageUrl} alt={exhibition.name} className="w-full h-40 sm:h-full object-cover" />
          </div>
        )}
        <CardContent className="flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {isCompleted ? (
              <Badge variant="secondary">Completed</Badge>
            ) : !anyAvailable ? (
              <Badge variant="destructive">Sold Out</Badge>
            ) : (
              <Badge variant="success">Available</Badge>
            )}
          </div>
          <h3 className="font-display text-lg mb-1">{exhibition.name}</h3>
          {exhibition.organizer && (
            <p className="text-sm text-muted-foreground mb-2">by {exhibition.organizer.name}</p>
          )}
          <div className="space-y-1 text-sm text-muted-foreground mb-4">
            <p className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {formatDate(exhibition.startDate)}
            </p>
            {(exhibition.venue || exhibition.city) && (
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {[exhibition.venue, exhibition.city].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link to={`/exhibition/${exhibition.id}`}>
              <Button size="sm">Open Event</Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive"
              onClick={() => unsave.mutate()}
              disabled={unsave.isPending}
              aria-label="Remove event from saved events"
            >
              <BookmarkX className="w-4 h-4" />
              Remove
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

const Dashboard = () => {
  // UI-04: the ticket list used to be rendered inline here (a "tickets" tab
  // duplicating what's now the canonical /my-tickets page). Removed in favor
  // of a single real ticket-list implementation — see MyTickets.tsx, which
  // uses the exact same useMyTicketBookings()/useTicketQr() hooks this file
  // used to call directly. The sidebar's "My Tickets" entry below now links
  // there instead of switching an internal tab.
  const [activeTab, setActiveTab] = useState("saved");
  const [savedPage, setSavedPage] = useState(1);
  const { user, signOut } = useAuth();
  const { data: savedData, isLoading: savedLoading } = useSavedExhibitionsList(savedPage);

  const initials = (user?.fullName || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                {/* User Info */}
                <div className="text-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mx-auto mb-4">
                    {initials}
                  </div>
                  <h3 className="font-display text-xl">{user?.fullName || "Visitor"}</h3>
                  <p className="text-muted-foreground text-sm">{user?.email}</p>
                </div>

                <Separator className="my-6" />

                {/* Navigation */}
                <nav className="space-y-1">
                  <Link
                    to="/my-tickets"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors hover:bg-muted text-foreground"
                  >
                    <Ticket className="w-5 h-5" />
                    <span className="font-medium">My Tickets</span>
                  </Link>

                  <button
                    onClick={() => setActiveTab("saved")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === "saved"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Bookmark className="w-5 h-5" />
                    <span className="font-medium">Saved Events</span>
                    {(savedData?.total ?? 0) > 0 && (
                      <Badge variant="accent" className="ml-auto">
                        {savedData?.total}
                      </Badge>
                    )}
                  </button>

                  <button
                    onClick={() => setActiveTab("support")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === "support"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <HelpCircle className="w-5 h-5" />
                    <span className="font-medium">Support</span>
                  </button>
                </nav>

                <Separator className="my-6" />

                <Button
                  variant="ghost"
                  className="w-full justify-start gap-3 text-destructive"
                  onClick={() => signOut()}
                >
                  <LogOut className="w-5 h-5" />
                  <span>Log Out</span>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Saved Events Tab */}
            {activeTab === "saved" && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-3xl mb-2">Saved Events</h1>
                  <p className="text-muted-foreground">Events you've bookmarked to come back to later</p>
                </div>

                {savedLoading ? (
                  <Card className="p-12 text-center text-muted-foreground">Loading your saved events...</Card>
                ) : !savedData || savedData.items.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Bookmark className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-display text-xl mb-2">No saved events yet</h3>
                    <p className="text-muted-foreground mb-6">
                      Tap the bookmark icon on any event to save it here for later.
                    </p>
                    <Link to="/exhibitions">
                      <Button>Explore Events</Button>
                    </Link>
                  </Card>
                ) : (
                  <>
                    <div className="space-y-4">
                      {savedData.items.map((entry) => (
                        <SavedEventCard key={entry.id} entry={entry} />
                      ))}
                    </div>

                    {savedData.total > savedData.pageSize && (
                      <div className="flex items-center justify-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setSavedPage((p) => Math.max(1, p - 1))}
                          disabled={savedPage <= 1}
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page {savedData.page} of {Math.ceil(savedData.total / savedData.pageSize)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setSavedPage((p) => p + 1)}
                          disabled={savedPage * savedData.pageSize >= savedData.total}
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Support Tab */}
            {activeTab === "support" && (
              <div className="space-y-8">
                <div>
                  <h1 className="font-display text-3xl mb-2">Help & Support</h1>
                  <p className="text-muted-foreground">
                    We're here to help with any questions or issues
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <Card className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Phone className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Call Us</h3>
                        <p className="text-muted-foreground text-sm mb-3">
                          Available 9 AM - 9 PM IST
                        </p>
                        <a
                          href="tel:+918001234567"
                          className="text-primary font-semibold hover:underline"
                        >
                          +91 800-123-4567
                        </a>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Mail className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Email Us</h3>
                        <p className="text-muted-foreground text-sm mb-3">
                          We'll respond within 24 hours
                        </p>
                        <a
                          href="mailto:support@exhibittix.com"
                          className="text-primary font-semibold hover:underline"
                        >
                          support@exhibittix.com
                        </a>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Dashboard;
