import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  Calendar,
  MapPin,
  ChevronLeft,
  Minus,
  Plus,
  CreditCard,
  Smartphone,
  Building,
  Check,
  AlertCircle,
  QrCode,
  Download,
  Mail,
  Ticket,
  User,
  Phone,
  Shield,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getExhibitionById } from "@/data/exhibitions";

type BookingStep = "tickets" | "details" | "payment" | "confirmation";

const BookingFlow = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const ticketId = searchParams.get("ticket");
  const exhibition = getExhibitionById(id || "");
  const selectedTicketType = exhibition?.tickets.find((t) => t.id === ticketId);

  const [step, setStep] = useState<BookingStep>("tickets");
  const [quantity, setQuantity] = useState(1);
  const [visitDate, setVisitDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [userDetails, setUserDetails] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [bookingId, setBookingId] = useState("");

  if (!exhibition || !selectedTicketType) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="font-display text-3xl mb-4">Booking Error</h1>
          <p className="text-muted-foreground mb-6">
            Unable to process your booking. Please try again.
          </p>
          <Button onClick={() => navigate("/exhibitions")}>Browse Exhibitions</Button>
        </div>
        <Footer />
      </div>
    );
  }

  const subtotal = selectedTicketType.price * quantity;
  const convenienceFee = Math.round(subtotal * 0.02);
  const gst = Math.round(convenienceFee * 0.18);
  const total = subtotal + convenienceFee + gst;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleNextStep = () => {
    if (step === "tickets") setStep("details");
    else if (step === "details") setStep("payment");
    else if (step === "payment") {
      const generatedId = `ETX${Date.now().toString().slice(-8)}`;
      setBookingId(generatedId);
      setStep("confirmation");
    }
  };

  const handlePrevStep = () => {
    if (step === "details") setStep("tickets");
    else if (step === "payment") setStep("details");
    else if (step === "tickets") navigate(`/exhibition/${id}`);
  };

  const steps = [
    { id: "tickets", label: "Tickets", icon: Ticket },
    { id: "details", label: "Details", icon: User },
    { id: "payment", label: "Payment", icon: CreditCard },
    { id: "confirmation", label: "Done", icon: Check },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Progress Bar - Clean & Prominent */}
      <div className="bg-card border-b sticky top-16 lg:top-20 z-40">
        <div className="container mx-auto py-4">
          <div className="flex items-center justify-center max-w-xl mx-auto">
            {steps.map((s, index) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex flex-col items-center ${
                    index <= currentStepIndex ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      index < currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : index === currentStepIndex
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <s.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs font-medium mt-1.5 hidden sm:block">{s.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-16 sm:w-24 h-1 mx-2 rounded-full transition-colors ${
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Back Button */}
            {step !== "confirmation" && (
              <Button
                variant="ghost"
                className="mb-6 -ml-2"
                onClick={handlePrevStep}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}

            {/* Step 1: Tickets */}
            {step === "tickets" && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-xl">Select Quantity & Date</CardTitle>
                  <p className="text-muted-foreground text-sm">Choose how many tickets and when you'd like to visit</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Selected Ticket Display */}
                  <div className="p-5 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <Badge className="mb-2 bg-primary text-primary-foreground">
                          <Check className="w-3 h-3 mr-1" />
                          Selected
                        </Badge>
                        <h3 className="font-display font-semibold text-lg">{selectedTicketType.name}</h3>
                        <p className="text-muted-foreground text-sm mt-1">
                          {selectedTicketType.description}
                        </p>
                        <ul className="mt-3 space-y-1">
                          {selectedTicketType.benefits.slice(0, 3).map((benefit, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-primary" />
                              {benefit}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">
                          ₹{selectedTicketType.price.toLocaleString("en-IN")}
                        </p>
                        {selectedTicketType.originalPrice && (
                          <p className="text-sm text-muted-foreground line-through">
                            ₹{selectedTicketType.originalPrice.toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Selector */}
                  <div className="bg-muted/50 rounded-xl p-5">
                    <Label className="text-base font-medium mb-4 block">Number of Tickets</Label>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 rounded-xl"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus className="w-5 h-5" />
                      </Button>
                      <span className="text-3xl font-bold w-16 text-center">{quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 rounded-xl"
                        onClick={() => setQuantity(Math.min(10, quantity + 1))}
                        disabled={quantity >= 10}
                      >
                        <Plus className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                      Maximum 10 tickets per booking
                    </p>
                  </div>

                  {/* Date Selector */}
                  <div className="bg-muted/50 rounded-xl p-5">
                    <Label htmlFor="visitDate" className="text-base font-medium mb-4 block">
                      Select Visit Date
                    </Label>
                    <div className="relative max-w-sm">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="visitDate"
                        type="date"
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        max={exhibition.endDate}
                        className="h-14 pl-12 text-base rounded-xl"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Exhibition ends on {formatDate(exhibition.endDate)}
                    </p>
                  </div>

                  <Button
                    size="lg"
                    className="w-full h-14 text-base"
                    onClick={handleNextStep}
                    disabled={!visitDate}
                  >
                    Continue to Details
                    <ChevronLeft className="w-5 h-5 ml-2 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Details */}
            {step === "details" && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-xl">Your Details</CardTitle>
                  <p className="text-muted-foreground text-sm">Enter the details for ticket holder</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                      <div className="relative mt-2">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="name"
                          placeholder="Enter your full name"
                          value={userDetails.name}
                          onChange={(e) =>
                            setUserDetails({ ...userDetails, name: e.target.value })
                          }
                          className="h-14 pl-12 text-base rounded-xl"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-sm font-medium">Phone Number</Label>
                      <div className="relative mt-2">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="10-digit mobile number"
                          value={userDetails.phone}
                          onChange={(e) =>
                            setUserDetails({ ...userDetails, phone: e.target.value })
                          }
                          className="h-14 pl-12 text-base rounded-xl"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={userDetails.email}
                        onChange={(e) =>
                          setUserDetails({ ...userDetails, email: e.target.value })
                        }
                        className="h-14 pl-12 text-base rounded-xl"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Tickets will be sent to this email
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-muted/50 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Please ensure your details are correct. These will appear on your tickets
                      and cannot be changed later.
                    </p>
                  </div>

                  <Button
                    size="lg"
                    className="w-full h-14 text-base"
                    onClick={handleNextStep}
                    disabled={!userDetails.name || !userDetails.email || !userDetails.phone}
                  >
                    Continue to Payment
                    <ChevronLeft className="w-5 h-5 ml-2 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Payment */}
            {step === "payment" && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-xl">Payment Method</CardTitle>
                  <p className="text-muted-foreground text-sm">Choose your preferred payment option</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-3">
                    <div
                      className={`flex items-center space-x-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "upi"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="upi" id="upi" />
                      <Label
                        htmlFor="upi"
                        className="flex items-center gap-4 cursor-pointer flex-1"
                      >
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <Smartphone className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">UPI</p>
                          <p className="text-sm text-muted-foreground">
                            Google Pay, PhonePe, Paytm, BHIM
                          </p>
                        </div>
                      </Label>
                      <Badge className="shrink-0 bg-emerald text-emerald-foreground">
                        Instant
                      </Badge>
                    </div>

                    <div
                      className={`flex items-center space-x-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "card"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="card" id="card" />
                      <Label
                        htmlFor="card"
                        className="flex items-center gap-4 cursor-pointer flex-1"
                      >
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <CreditCard className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">Credit / Debit Card</p>
                          <p className="text-sm text-muted-foreground">
                            Visa, Mastercard, RuPay
                          </p>
                        </div>
                      </Label>
                    </div>

                    <div
                      className={`flex items-center space-x-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "netbanking"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="netbanking" id="netbanking" />
                      <Label
                        htmlFor="netbanking"
                        className="flex items-center gap-4 cursor-pointer flex-1"
                      >
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <Building className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">Net Banking</p>
                          <p className="text-sm text-muted-foreground">All major banks</p>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  <div className="p-4 rounded-xl bg-muted/50 flex items-center gap-3">
                    <Shield className="w-5 h-5 text-emerald" />
                    <p className="text-sm text-muted-foreground">
                      Your payment is 100% secure with 256-bit SSL encryption
                    </p>
                  </div>

                  <Button size="lg" className="w-full h-14 text-base" onClick={handleNextStep}>
                    Pay ₹{total.toLocaleString("en-IN")}
                    <ChevronLeft className="w-5 h-5 ml-2 rotate-180" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Confirmation */}
            {step === "confirmation" && (
              <Card className="border-0 shadow-lg text-center">
                <CardContent className="py-12 px-8">
                  <div className="w-24 h-24 rounded-full bg-emerald flex items-center justify-center mx-auto mb-6 animate-scale-in">
                    <Check className="w-12 h-12 text-emerald-foreground" />
                  </div>

                  <h2 className="font-display text-3xl text-foreground mb-2">
                    Booking Confirmed! 🎉
                  </h2>
                  <p className="text-muted-foreground mb-8">
                    Your tickets have been sent to <span className="font-medium text-foreground">{userDetails.email}</span>
                  </p>

                  <div className="inline-block p-6 rounded-2xl bg-muted mb-8">
                    <p className="text-sm text-muted-foreground mb-2">Booking ID</p>
                    <p className="font-mono text-3xl font-bold text-foreground">{bookingId}</p>
                  </div>

                  {/* QR Code Placeholder */}
                  <div className="max-w-xs mx-auto mb-8">
                    <div className="aspect-square bg-card rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center p-8">
                      <QrCode className="w-32 h-32 text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground text-center">
                        Show this QR code at the entrance
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button size="lg" className="gap-2">
                      <Download className="w-5 h-5" />
                      Download Tickets
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => navigate("/dashboard")}>
                      View My Bookings
                    </Button>
                  </div>

                  <Separator className="my-8" />

                  <div className="bg-muted/50 rounded-xl p-6 text-left">
                    <h4 className="font-semibold mb-4">Booking Details</h4>
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Exhibition</p>
                        <p className="font-medium">{exhibition.title}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Visit Date</p>
                        <p className="font-medium">{formatDate(visitDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ticket Type</p>
                        <p className="font-medium">{selectedTicketType.name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Quantity</p>
                        <p className="font-medium">{quantity} {quantity > 1 ? 'tickets' : 'ticket'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Venue</p>
                        <p className="font-medium">{exhibition.venue}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Paid</p>
                        <p className="font-semibold text-primary">₹{total.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary Sidebar */}
          {step !== "confirmation" && (
            <div className="lg:sticky lg:top-40 h-fit">
              <Card className="border-0 shadow-lg overflow-hidden">
                <div className="relative h-32">
                  <img
                    src={exhibition.images[0]}
                    alt={exhibition.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="font-semibold text-background line-clamp-1">{exhibition.title}</h3>
                    <p className="text-background/70 text-sm flex items-center gap-2">
                      <MapPin className="w-3 h-3" />
                      {exhibition.venue}
                    </p>
                  </div>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{selectedTicketType.name} × {quantity}</span>
                      <span>₹{subtotal.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Convenience Fee</span>
                      <span>₹{convenienceFee.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GST (18%)</span>
                      <span>₹{gst.toLocaleString("en-IN")}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span className="text-primary">₹{total.toLocaleString("en-IN")}</span>
                  </div>

                  {visitDate && (
                    <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Visit Date</p>
                        <p className="font-medium text-sm">{formatDate(visitDate)}</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald" />
                      Instant confirmation
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald" />
                      Free cancellation up to 24 hours
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald" />
                      Secure payment
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default BookingFlow;
