import { useState } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Ticket,
  QrCode,
  Calendar,
  MapPin,
  Clock,
  HelpCircle,
  LogOut,
  Mail,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useMyTicketBookings } from "@/hooks/exhibitor/useBookings";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("tickets");
  const { user, signOut } = useAuth();
  const { data: bookings = [], isLoading } = useMyTicketBookings();

  const upcomingBookings = bookings.filter((b) => !b.checkInStatus);
  const pastBookings = bookings.filter((b) => b.checkInStatus);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "TBA";
    return new Date(dateString).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

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
                  <button
                    onClick={() => setActiveTab("tickets")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === "tickets"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <Ticket className="w-5 h-5" />
                    <span className="font-medium">My Tickets</span>
                    <Badge variant="accent" className="ml-auto">
                      {upcomingBookings.length}
                    </Badge>
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
            {/* Tickets Tab */}
            {activeTab === "tickets" && (
              <div className="space-y-8">
                <div>
                  <h1 className="font-display text-3xl mb-2">My Tickets</h1>
                  <p className="text-muted-foreground">
                    Manage your exhibition bookings
                  </p>
                </div>

                {isLoading ? (
                  <Card className="p-12 text-center text-muted-foreground">Loading your bookings...</Card>
                ) : (
                  <>
                    {/* Upcoming Tickets */}
                    <div>
                      <h2 className="font-display text-xl mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        Upcoming ({upcomingBookings.length})
                      </h2>

                      <div className="space-y-4">
                        {upcomingBookings.map((booking) => (
                          <Card key={booking.id} className="overflow-hidden">
                            <div className="flex flex-col md:flex-row">
                              {booking.exhibition?.coverImageUrl && (
                                <div className="md:w-1/4">
                                  <img
                                    src={booking.exhibition.coverImageUrl}
                                    alt={booking.exhibition.name}
                                    className="w-full h-48 md:h-full object-cover"
                                  />
                                </div>
                              )}
                              <CardContent className="flex-1 p-6">
                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <Badge variant="success" className="mb-2">
                                      Confirmed
                                    </Badge>
                                    <h3 className="font-display text-xl mb-2">
                                      {booking.exhibition?.name}
                                    </h3>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                      <p className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4" />
                                        {booking.exhibition?.venue}, {booking.exhibition?.city}
                                      </p>
                                      <p className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        {formatDate(booking.visitDate)}
                                      </p>
                                      <p className="flex items-center gap-2">
                                        <Ticket className="w-4 h-4" />
                                        {booking.ticketType?.name} × {booking.quantity}
                                      </p>
                                    </div>

                                    <div className="mt-4 p-3 bg-muted rounded-lg inline-block">
                                      <p className="text-xs text-muted-foreground">Booking ID</p>
                                      <p className="font-mono font-bold">{booking.id.slice(0, 8).toUpperCase()}</p>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center gap-3">
                                    <div className="w-32 h-32 bg-card border-2 border-dashed border-border rounded-xl flex items-center justify-center">
                                      <QrCode className="w-20 h-20 text-foreground" />
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Past Tickets */}
                    {pastBookings.length > 0 && (
                      <div>
                        <h2 className="font-display text-xl mb-4 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-muted-foreground" />
                          Past Bookings ({pastBookings.length})
                        </h2>

                        <div className="space-y-4">
                          {pastBookings.map((booking) => (
                            <Card key={booking.id} className="opacity-75">
                              <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    {booking.exhibition?.coverImageUrl && (
                                      <img
                                        src={booking.exhibition.coverImageUrl}
                                        alt={booking.exhibition.name}
                                        className="w-16 h-16 rounded-lg object-cover"
                                      />
                                    )}
                                    <div>
                                      <Badge variant="secondary" className="mb-1">
                                        Checked in
                                      </Badge>
                                      <h4 className="font-semibold">{booking.exhibition?.name}</h4>
                                      <p className="text-sm text-muted-foreground">
                                        {formatDate(booking.visitDate)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-mono text-sm">{booking.id.slice(0, 8).toUpperCase()}</p>
                                    <p className="font-semibold">
                                      ₹{Number(booking.amountPaid).toLocaleString("en-IN")}
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty State */}
                    {bookings.length === 0 && (
                      <Card className="p-12 text-center">
                        <Ticket className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <h3 className="font-display text-xl mb-2">No Tickets Yet</h3>
                        <p className="text-muted-foreground mb-6">
                          You haven't booked any exhibitions yet. Start exploring!
                        </p>
                        <Link to="/exhibitions">
                          <Button>Browse Exhibitions</Button>
                        </Link>
                      </Card>
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
