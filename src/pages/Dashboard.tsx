import { useState } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Ticket,
  QrCode,
  Download,
  Calendar,
  MapPin,
  Clock,
  Settings,
  HelpCircle,
  LogOut,
  Bell,
  CreditCard,
  ChevronRight,
  Mail,
  Phone,
  Edit2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { exhibitions } from "@/data/exhibitions";

// Mock user data
const mockUser = {
  name: "Rahul Sharma",
  email: "rahul.sharma@example.com",
  phone: "+91 98765 43210",
  avatar: "RS",
};

// Mock bookings
const mockBookings = [
  {
    id: "ETX12345678",
    exhibition: exhibitions[0],
    ticketType: "Premium Experience",
    quantity: 2,
    visitDate: "2024-03-20",
    totalAmount: 1598,
    status: "upcoming",
    qrCode: "QR12345",
  },
  {
    id: "ETX87654321",
    exhibition: exhibitions[1],
    ticketType: "Curator's Tour",
    quantity: 1,
    visitDate: "2024-03-25",
    totalAmount: 599,
    status: "upcoming",
    qrCode: "QR54321",
  },
  {
    id: "ETX11223344",
    exhibition: exhibitions[2],
    ticketType: "Day Pass",
    quantity: 3,
    visitDate: "2024-02-15",
    totalAmount: 1497,
    status: "completed",
    qrCode: "QR11223",
  },
];

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("tickets");
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState(mockUser);

  const upcomingBookings = mockBookings.filter((b) => b.status === "upcoming");
  const pastBookings = mockBookings.filter((b) => b.status === "completed");

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

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
                    {profile.avatar}
                  </div>
                  <h3 className="font-display text-xl">{profile.name}</h3>
                  <p className="text-muted-foreground text-sm">{profile.email}</p>
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
                    onClick={() => setActiveTab("profile")}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      activeTab === "profile"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <User className="w-5 h-5" />
                    <span className="font-medium">Profile</span>
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

                <Button variant="ghost" className="w-full justify-start gap-3 text-destructive">
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
                    Manage your exhibition bookings and download tickets
                  </p>
                </div>

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
                          <div className="md:w-1/4">
                            <img
                              src={booking.exhibition.images[0]}
                              alt={booking.exhibition.title}
                              className="w-full h-48 md:h-full object-cover"
                            />
                          </div>
                          <CardContent className="flex-1 p-6">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              <div className="flex-1">
                                <Badge variant="success" className="mb-2">
                                  Confirmed
                                </Badge>
                                <h3 className="font-display text-xl mb-2">
                                  {booking.exhibition.title}
                                </h3>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                  <p className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    {booking.exhibition.venue}, {booking.exhibition.city}
                                  </p>
                                  <p className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(booking.visitDate)}
                                  </p>
                                  <p className="flex items-center gap-2">
                                    <Ticket className="w-4 h-4" />
                                    {booking.ticketType} × {booking.quantity}
                                  </p>
                                </div>

                                <div className="mt-4 p-3 bg-muted rounded-lg inline-block">
                                  <p className="text-xs text-muted-foreground">Booking ID</p>
                                  <p className="font-mono font-bold">{booking.id}</p>
                                </div>
                              </div>

                              <div className="flex flex-col items-center gap-3">
                                <div className="w-32 h-32 bg-card border-2 border-dashed border-border rounded-xl flex items-center justify-center">
                                  <QrCode className="w-20 h-20 text-foreground" />
                                </div>
                                <Button size="sm" className="gap-2 w-full">
                                  <Download className="w-4 h-4" />
                                  Download
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Past Tickets */}
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
                              <img
                                src={booking.exhibition.images[0]}
                                alt={booking.exhibition.title}
                                className="w-16 h-16 rounded-lg object-cover"
                              />
                              <div>
                                <Badge variant="secondary" className="mb-1">
                                  Completed
                                </Badge>
                                <h4 className="font-semibold">{booking.exhibition.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(booking.visitDate)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">{booking.id}</p>
                              <p className="font-semibold">
                                ₹{booking.totalAmount.toLocaleString("en-IN")}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Empty State */}
                {mockBookings.length === 0 && (
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
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === "profile" && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="font-display text-3xl mb-2">Profile Settings</h1>
                    <p className="text-muted-foreground">Manage your personal information</p>
                  </div>
                  <Button
                    variant={isEditing ? "default" : "outline"}
                    onClick={() => setIsEditing(!isEditing)}
                    className="gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    {isEditing ? "Save Changes" : "Edit Profile"}
                  </Button>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          disabled={!isEditing}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profile.email}
                          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                          disabled={!isEditing}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={profile.phone}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          disabled={!isEditing}
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                        <div className="flex items-center gap-3">
                          <Bell className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-medium">Email Notifications</p>
                            <p className="text-sm text-muted-foreground">
                              Get updates about your bookings
                            </p>
                          </div>
                        </div>
                        <Badge variant="success">Enabled</Badge>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-5 h-5 text-primary" />
                          <div>
                            <p className="font-medium">Saved Payment Methods</p>
                            <p className="text-sm text-muted-foreground">
                              Manage your payment options
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
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

                <Card>
                  <CardHeader>
                    <CardTitle>Frequently Asked Questions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {[
                        {
                          q: "How do I cancel my booking?",
                          a: "You can cancel your booking up to 24 hours before the event for a full refund. Go to My Tickets, select the booking, and click Cancel.",
                        },
                        {
                          q: "Can I transfer my ticket to someone else?",
                          a: "Yes, tickets can be transferred. The QR code remains valid, and the new attendee can use it for entry.",
                        },
                        {
                          q: "What if I lose my ticket?",
                          a: "Don't worry! You can always access your tickets from your dashboard. They're also emailed to you.",
                        },
                        {
                          q: "Are there group discounts available?",
                          a: "Yes, groups of 10+ can avail special discounts. Contact our support team for bulk booking assistance.",
                        },
                      ].map((faq, index) => (
                        <div key={index} className="p-4 rounded-lg bg-muted">
                          <h4 className="font-semibold mb-2">{faq.q}</h4>
                          <p className="text-sm text-muted-foreground">{faq.a}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
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
