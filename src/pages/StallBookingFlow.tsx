import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Calendar,
  User,
  CreditCard,
  Building2,
  Square,
  Maximize,
  Zap,
  Wifi,
  Armchair,
  Lightbulb,
  IndianRupee,
  QrCode,
  Download,
  Mail,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getExhibitionById } from "@/data/exhibitions";

const stallTypes = [
  {
    id: "basic",
    name: "Basic Stall",
    size: "3m x 3m (9 sqm)",
    price: 15000,
    description: "Perfect for startups and small businesses",
    features: [
      "9 sqm open space",
      "Basic lighting",
      "1 power socket",
      "1 table + 2 chairs",
    ],
    icon: Square,
    popular: false,
  },
  {
    id: "standard",
    name: "Standard Stall",
    size: "4m x 3m (12 sqm)",
    price: 25000,
    description: "Ideal for established businesses",
    features: [
      "12 sqm with partition walls",
      "Enhanced lighting",
      "3 power sockets",
      "2 tables + 4 chairs",
      "Company fascia board",
    ],
    icon: Building2,
    popular: true,
  },
  {
    id: "premium",
    name: "Premium Stall",
    size: "6m x 3m (18 sqm)",
    price: 45000,
    description: "For maximum visibility and impact",
    features: [
      "18 sqm corner location",
      "Premium lighting setup",
      "5 power sockets",
      "Display shelves included",
      "Company fascia board",
      "Carpet flooring",
    ],
    icon: Maximize,
    popular: false,
  },
  {
    id: "custom",
    name: "Custom Pavilion",
    size: "9m x 6m (54 sqm)",
    price: 120000,
    description: "Exclusive branded pavilion space",
    features: [
      "54 sqm prime location",
      "Custom booth design",
      "Dedicated power line",
      "Premium furniture set",
      "Branding opportunities",
      "Storage room included",
      "VIP meeting area",
    ],
    icon: Zap,
    popular: false,
  },
];

const addons = [
  { id: "wifi", name: "Dedicated WiFi", price: 2500, icon: Wifi },
  { id: "furniture", name: "Extra Furniture Set", price: 3500, icon: Armchair },
  { id: "lighting", name: "Spotlight Package", price: 4000, icon: Lightbulb },
  { id: "display", name: "Digital Display Screen", price: 8000, icon: Square },
];

const StallBookingFlow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  
  const [selectedStall, setSelectedStall] = useState<string>("");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  
  const [companyDetails, setCompanyDetails] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    gstNumber: "",
    website: "",
    businessType: "",
    productDescription: "",
  });

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

  const selectedStallData = stallTypes.find((s) => s.id === selectedStall);
  const selectedAddonsData = addons.filter((a) => selectedAddons.includes(a.id));
  
  const stallPrice = selectedStallData?.price || 0;
  const addonsPrice = selectedAddonsData.reduce((sum, a) => sum + a.price, 0);
  const subtotal = stallPrice + addonsPrice;
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const toggleAddon = (addonId: string) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId)
        ? prev.filter((id) => id !== addonId)
        : [...prev, addonId]
    );
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setCompanyDetails((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedStall !== "";
      case 2:
        return (
          companyDetails.companyName &&
          companyDetails.contactPerson &&
          companyDetails.email &&
          companyDetails.phone
        );
      case 3:
        return paymentMethod !== "";
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (canProceed() && step < 4) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const steps = [
    { id: 1, title: "Select Stall", icon: Building2 },
    { id: 2, title: "Company Details", icon: User },
    { id: 3, title: "Payment", icon: CreditCard },
    { id: 4, title: "Confirmation", icon: Check },
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Progress Header */}
      <div className="bg-card border-b sticky top-16 z-40">
        <div className="container mx-auto py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(`/exhibition/${id}`)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Exhibition
            </button>
            <Badge variant="outline" className="gap-2">
              <Building2 className="w-3 h-3" />
              Stall Booking
            </Badge>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {steps.map((s, index) => (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      step > s.id
                        ? "bg-primary text-primary-foreground"
                        : step === s.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s.id ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <s.icon className="w-5 h-5" />
                    )}
                  </div>
                  <span
                    className={`text-xs mt-2 hidden sm:block ${
                      step >= s.id ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-16 sm:w-24 h-1 mx-2 rounded ${
                      step > s.id ? "bg-primary" : "bg-muted"
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
            {/* Step 1: Stall Selection */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-2xl mb-2">
                    Select Your Stall Type
                  </h2>
                  <p className="text-muted-foreground">
                    Choose a stall that fits your business needs and budget
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {stallTypes.map((stall) => (
                    <Card
                      key={stall.id}
                      onClick={() => setSelectedStall(stall.id)}
                      className={`relative cursor-pointer transition-all hover:shadow-lg ${
                        selectedStall === stall.id
                          ? "ring-2 ring-primary border-primary"
                          : "hover:border-primary/50"
                      }`}
                    >
                      {stall.popular && (
                        <Badge
                          variant="accent"
                          className="absolute -top-2 left-4"
                        >
                          Most Popular
                        </Badge>
                      )}
                      {selectedStall === stall.id && (
                        <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <stall.icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">
                              {stall.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {stall.size}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                          {stall.description}
                        </p>
                        <div className="flex items-baseline gap-1 mb-4">
                          <IndianRupee className="w-4 h-4" />
                          <span className="text-2xl font-bold">
                            {stall.price.toLocaleString("en-IN")}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            + GST
                          </span>
                        </div>
                        <ul className="space-y-2">
                          {stall.features.map((feature, index) => (
                            <li
                              key={index}
                              className="flex items-center gap-2 text-sm"
                            >
                              <Check className="w-4 h-4 text-primary shrink-0" />
                              <span className="text-muted-foreground">
                                {feature}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Add-ons */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Enhance Your Stall
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {addons.map((addon) => (
                        <div
                          key={addon.id}
                          onClick={() => toggleAddon(addon.id)}
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            selectedAddons.includes(addon.id)
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <Checkbox
                            checked={selectedAddons.includes(addon.id)}
                            className="pointer-events-none"
                          />
                          <addon.icon className="w-5 h-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">{addon.name}</p>
                            <p className="text-sm text-muted-foreground">
                              ₹{addon.price.toLocaleString("en-IN")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 2: Company Details */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Company Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name *</Label>
                      <Input
                        id="companyName"
                        name="companyName"
                        value={companyDetails.companyName}
                        onChange={handleInputChange}
                        placeholder="Your Company Pvt. Ltd."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPerson">Contact Person *</Label>
                      <Input
                        id="contactPerson"
                        name="contactPerson"
                        value={companyDetails.contactPerson}
                        onChange={handleInputChange}
                        placeholder="Full name"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={companyDetails.email}
                        onChange={handleInputChange}
                        placeholder="company@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={companyDetails.phone}
                        onChange={handleInputChange}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="gstNumber">GST Number (Optional)</Label>
                      <Input
                        id="gstNumber"
                        name="gstNumber"
                        value={companyDetails.gstNumber}
                        onChange={handleInputChange}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website (Optional)</Label>
                      <Input
                        id="website"
                        name="website"
                        value={companyDetails.website}
                        onChange={handleInputChange}
                        placeholder="https://yourcompany.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessType">Type of Business</Label>
                    <Input
                      id="businessType"
                      name="businessType"
                      value={companyDetails.businessType}
                      onChange={handleInputChange}
                      placeholder="e.g., Jewellery Manufacturing, Fashion Retail"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="productDescription">
                      Products/Services Description
                    </Label>
                    <Textarea
                      id="productDescription"
                      name="productDescription"
                      value={companyDetails.productDescription}
                      onChange={handleInputChange}
                      placeholder="Brief description of what you'll be showcasing..."
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Payment */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment Method</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="space-y-4"
                  >
                    <div
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "upi"
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setPaymentMethod("upi")}
                    >
                      <RadioGroupItem value="upi" id="upi" />
                      <div className="flex-1">
                        <Label htmlFor="upi" className="cursor-pointer">
                          UPI Payment
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Pay using Google Pay, PhonePe, Paytm, or any UPI app
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "card"
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setPaymentMethod("card")}
                    >
                      <RadioGroupItem value="card" id="card" />
                      <div className="flex-1">
                        <Label htmlFor="card" className="cursor-pointer">
                          Credit / Debit Card
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Visa, Mastercard, RuPay accepted
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "netbanking"
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setPaymentMethod("netbanking")}
                    >
                      <RadioGroupItem value="netbanking" id="netbanking" />
                      <div className="flex-1">
                        <Label htmlFor="netbanking" className="cursor-pointer">
                          Net Banking
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          All major banks supported
                        </p>
                      </div>
                    </div>

                    <div
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        paymentMethod === "bank"
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                      onClick={() => setPaymentMethod("bank")}
                    >
                      <RadioGroupItem value="bank" id="bank" />
                      <div className="flex-1">
                        <Label htmlFor="bank" className="cursor-pointer">
                          Bank Transfer (NEFT/RTGS)
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          For high-value transactions. Booking confirmed after
                          payment verification.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>

                  <div className="mt-6 p-4 bg-muted rounded-xl">
                    <p className="text-sm text-muted-foreground">
                      By proceeding with payment, you agree to our Terms of
                      Service and Exhibitor Agreement. A 50% advance is required
                      to confirm your booking.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Confirmation */}
            {step === 4 && (
              <div className="space-y-6">
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-8 text-center">
                    <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
                      <Check className="w-10 h-10 text-primary" />
                    </div>
                    <h2 className="font-display text-3xl text-foreground mb-2">
                      Booking Confirmed!
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      Your stall has been successfully booked
                    </p>
                    <Badge variant="accent" className="text-lg px-4 py-1">
                      Booking ID: STL-{Math.random().toString(36).substring(2, 10).toUpperCase()}
                    </Badge>
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Stall Pass</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center">
                      <div className="w-48 h-48 bg-muted rounded-xl flex items-center justify-center mb-4">
                        <QrCode className="w-32 h-32 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground text-center mb-4">
                        Show this QR code at the venue for exhibitor entry
                      </p>
                      <Button variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        Download Pass
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Next Steps</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-4">
                        <li className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">
                              1
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">
                              Check your email
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Confirmation and invoice sent to{" "}
                              {companyDetails.email}
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">
                              2
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">Setup Guidelines</p>
                            <p className="text-sm text-muted-foreground">
                              Exhibitor manual will be shared 7 days before
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">
                              3
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">Stall Setup</p>
                            <p className="text-sm text-muted-foreground">
                              Access venue 1 day before for setup
                            </p>
                          </div>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/exhibitor-dashboard">
                    <Button size="lg" className="gap-2">
                      <Building2 className="w-4 h-4" />
                      Go to Dashboard
                    </Button>
                  </Link>
                  <Link to="/exhibitions">
                    <Button variant="outline" size="lg">
                      Browse More Exhibitions
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            {step < 4 && (
              <div className="flex justify-between mt-8">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={step === 1}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <Button
                  onClick={nextStep}
                  disabled={!canProceed()}
                  className="gap-2"
                >
                  {step === 3 ? "Confirm & Pay" : "Continue"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          {step < 4 && (
            <div className="lg:col-span-1">
              <Card className="sticky top-40">
                <CardHeader className="bg-muted/50">
                  <CardTitle className="text-lg">Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {/* Exhibition Info */}
                  <div className="flex gap-4">
                    <img
                      src={exhibition.images[0]}
                      alt={exhibition.title}
                      className="w-20 h-16 object-cover rounded-lg"
                    />
                    <div>
                      <h4 className="font-semibold text-sm line-clamp-2">
                        {exhibition.title}
                      </h4>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3 h-3" />
                        {exhibition.city}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {formatDate(exhibition.startDate)}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Selected Stall */}
                  {selectedStallData ? (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">
                            {selectedStallData.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {selectedStallData.size}
                          </p>
                        </div>
                        <p className="font-semibold">
                          ₹{stallPrice.toLocaleString("en-IN")}
                        </p>
                      </div>

                      {/* Add-ons */}
                      {selectedAddonsData.length > 0 && (
                        <>
                          <p className="text-sm font-medium text-muted-foreground">
                            Add-ons
                          </p>
                          {selectedAddonsData.map((addon) => (
                            <div
                              key={addon.id}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {addon.name}
                              </span>
                              <span>
                                ₹{addon.price.toLocaleString("en-IN")}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Select a stall type to continue
                    </p>
                  )}

                  {selectedStallData && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Subtotal
                          </span>
                          <span>₹{subtotal.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            GST (18%)
                          </span>
                          <span>₹{gst.toLocaleString("en-IN")}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-semibold text-lg">
                          <span>Total</span>
                          <span className="text-primary">
                            ₹{total.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Help */}
              <Card className="mt-4 p-4">
                <h4 className="font-semibold mb-3">Need Assistance?</h4>
                <div className="space-y-2">
                  <a
                    href="tel:+918001234567"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="w-4 h-4" />
                    +91 800-123-4567
                  </a>
                  <a
                    href="mailto:exhibitors@exhibittix.com"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="w-4 h-4" />
                    exhibitors@exhibittix.com
                  </a>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default StallBookingFlow;
