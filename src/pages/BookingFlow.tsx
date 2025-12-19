import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Clock,
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
      // Simulate payment processing
      const generatedId = `ETX${Date.now().toString().slice(-8)}`;
      setBookingId(generatedId);
      setStep("confirmation");
    }
  };

  const steps = [
    { id: "tickets", label: "Tickets" },
    { id: "details", label: "Details" },
    { id: "payment", label: "Payment" },
    { id: "confirmation", label: "Confirmation" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Progress Bar */}
      <div className="bg-card border-b">
        <div className="container mx-auto py-4">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {steps.map((s, index) => (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex items-center gap-2 ${
                    index <= currentStepIndex ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      index < currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : index === currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className="hidden sm:inline text-sm font-medium">{s.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-12 sm:w-20 h-0.5 mx-2 ${
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
                className="mb-6"
                onClick={() => {
                  if (step === "tickets") navigate(`/exhibition/${id}`);
                  else if (step === "details") setStep("tickets");
                  else if (step === "payment") setStep("details");
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}

            {/* Step: Tickets */}
            {step === "tickets" && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Quantity & Date</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Selected Ticket */}
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div className="flex justify-between items-start">
                      <div>
                        <Badge variant="success" className="mb-2">
                          Selected
                        </Badge>
                        <h3 className="font-semibold text-lg">{selectedTicketType.name}</h3>
                        <p className="text-muted-foreground text-sm">
                          {selectedTicketType.description}
                        </p>
                      </div>
                      <p className="text-2xl font-bold">
                        ₹{selectedTicketType.price.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <Label className="text-base mb-3 block">Number of Tickets</Label>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={quantity <= 1}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.min(10, quantity + 1))}
                        disabled={quantity >= 10}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Maximum 10 tickets per booking
                    </p>
                  </div>

                  {/* Date */}
                  <div>
                    <Label htmlFor="visitDate" className="text-base mb-3 block">
                      Select Visit Date
                    </Label>
                    <Input
                      id="visitDate"
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      max={exhibition.endDate}
                      className="max-w-xs"
                    />
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleNextStep}
                    disabled={!visitDate}
                  >
                    Continue to Details
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step: Details */}
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <div className="relative mt-2">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="name"
                          placeholder="Enter your full name"
                          value={userDetails.name}
                          onChange={(e) =>
                            setUserDetails({ ...userDetails, name: e.target.value })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative mt-2">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="10-digit mobile number"
                          value={userDetails.phone}
                          onChange={(e) =>
                            setUserDetails({ ...userDetails, phone: e.target.value })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your@email.com"
                        value={userDetails.email}
                        onChange={(e) =>
                          setUserDetails({ ...userDetails, email: e.target.value })
                        }
                        className="pl-10"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Tickets will be sent to this email
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      Please ensure your details are correct. These will appear on your tickets
                      and cannot be changed later.
                    </p>
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleNextStep}
                    disabled={!userDetails.name || !userDetails.email || !userDetails.phone}
                  >
                    Continue to Payment
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step: Payment */}
            {step === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                    <div
                      className={`flex items-center space-x-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        paymentMethod === "upi"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="upi" id="upi" />
                      <Label
                        htmlFor="upi"
                        className="flex items-center gap-3 cursor-pointer flex-1"
                      >
                        <Smartphone className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">UPI</p>
                          <p className="text-sm text-muted-foreground">
                            Google Pay, PhonePe, Paytm, BHIM
                          </p>
                        </div>
                      </Label>
                      <Badge variant="success" className="shrink-0">
                        Recommended
                      </Badge>
                    </div>

                    <div
                      className={`flex items-center space-x-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        paymentMethod === "card"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="card" id="card" />
                      <Label
                        htmlFor="card"
                        className="flex items-center gap-3 cursor-pointer flex-1"
                      >
                        <CreditCard className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Credit / Debit Card</p>
                          <p className="text-sm text-muted-foreground">
                            Visa, Mastercard, RuPay
                          </p>
                        </div>
                      </Label>
                    </div>

                    <div
                      className={`flex items-center space-x-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        paymentMethod === "netbanking"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <RadioGroupItem value="netbanking" id="netbanking" />
                      <Label
                        htmlFor="netbanking"
                        className="flex items-center gap-3 cursor-pointer flex-1"
                      >
                        <Building className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-medium">Net Banking</p>
                          <p className="text-sm text-muted-foreground">All major banks</p>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  <Separator />

                  <div className="p-4 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Check className="w-4 h-4 text-primary" />
                      Your payment is 100% secure with 256-bit SSL encryption
                    </p>
                  </div>

                  <Button size="lg" variant="accent" className="w-full" onClick={handleNextStep}>
                    Pay ₹{total.toLocaleString("en-IN")}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step: Confirmation */}
            {step === "confirmation" && (
              <Card className="text-center">
                <CardContent className="py-12">
                  <div className="w-20 h-20 rounded-full gradient-success flex items-center justify-center mx-auto mb-6">
                    <Check className="w-10 h-10 text-primary-foreground" />
                  </div>

                  <h2 className="font-display text-3xl text-foreground mb-2">
                    Booking Confirmed!
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Your tickets have been sent to {userDetails.email}
                  </p>

                  <div className="inline-block p-6 rounded-xl bg-muted mb-6">
                    <p className="text-sm text-muted-foreground mb-2">Booking ID</p>
                    <p className="font-mono text-2xl font-bold text-foreground">{bookingId}</p>
                  </div>

                  {/* QR Code Placeholder */}
                  <div className="max-w-xs mx-auto mb-8">
                    <div className="aspect-square bg-card border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center p-6">
                      <QrCode className="w-32 h-32 text-foreground mb-4" />
                      <p className="text-sm text-muted-foreground">
                        Show this QR code at the venue entrance
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button size="lg" className="gap-2">
                      <Download className="w-4 h-4" />
                      Download Ticket
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={() => navigate("/dashboard")}
                    >
                      View My Tickets
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary Sidebar */}
          {step !== "confirmation" && (
            <div className="lg:col-span-1">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Exhibition Info */}
                  <div className="flex gap-3">
                    <img
                      src={exhibition.images[0]}
                      alt={exhibition.title}
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                    <div>
                      <h4 className="font-semibold line-clamp-2">{exhibition.title}</h4>
                      <p className="text-sm text-muted-foreground">{exhibition.venue}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ticket Type</span>
                      <span className="font-medium">{selectedTicketType.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Quantity</span>
                      <span className="font-medium">{quantity}</span>
                    </div>
                    {visitDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Visit Date</span>
                        <span className="font-medium">{formatDate(visitDate)}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Pricing */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {selectedTicketType.name} × {quantity}
                      </span>
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

                  <div className="flex justify-between">
                    <span className="font-semibold text-lg">Total</span>
                    <span className="font-bold text-xl">
                      ₹{total.toLocaleString("en-IN")}
                    </span>
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
