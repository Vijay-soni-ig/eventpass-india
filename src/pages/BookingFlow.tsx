import { useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Calendar, MapPin, ChevronLeft, Minus, Plus, CreditCard, Smartphone, Building, Check, AlertCircle, QrCode, Download, Mail, Ticket, User, Phone, Shield, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { usePublicExhibition } from "@/hooks/usePublicExhibitions";
import { useCreateTicketBooking, useTicketQr } from "@/hooks/exhibitor/useBookings";
import { usePricingQuote } from "@/hooks/usePricingQuote";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import PaymentGatewayDialog from "@/components/payment/PaymentGatewayDialog";
import type { Payment, PaymentOrder } from "@/types/payment";
import { getBookingIntentKey, loadBookingDraft, saveBookingDraft } from "@/lib/bookingDraft";

type BookingStep = "tickets" | "details" | "payment" | "confirmation";

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const BookingFlow = () => {
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const createBooking = useCreateTicketBooking();
  const ticketId = searchParams.get("ticket");
  const { data: exhibition, isLoading } = usePublicExhibition(id);
  const selectedTicketType = exhibition?.ticketTypes?.find((t) => t.id === ticketId);
  const remainingParam = Number(searchParams.get("remaining"));
  const maxQuantity = Number.isFinite(remainingParam) && remainingParam > 0 ? Math.min(10, remainingParam) : 10;
  const draft = ticketId ? loadBookingDraft(id ?? "", ticketId) : null;
  const [step, setStep] = useState<BookingStep>("tickets");
  const [quantity, setQuantity] = useState(draft?.quantity ?? 1);
  const [visitDate, setVisitDate] = useState(draft?.visitDate ?? "");
  const [userDetails, setUserDetails] = useState({ name: "", email: "", phone: "" });
  const [bookingId, setBookingId] = useState("");
  const [fullBookingId, setFullBookingId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gateway, setGateway] = useState<{ payment: Payment; order: PaymentOrder } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const { data: ticketQr } = useTicketQr(step === "confirmation" ? fullBookingId : undefined);
  const ticketPriceForQuote = selectedTicketType ? Number(selectedTicketType.price) : 0;
  const subtotalForQuote = ticketPriceForQuote * quantity;
  const { data: pricingBreakdown } = usePricingQuote(subtotalForQuote);

  if (isLoading) return (<div className="min-h-screen bg-background"><Header /><div className="container mx-auto py-20 text-center text-muted-foreground">Loading...</div><Footer /></div>);
  if (!exhibition || !selectedTicketType) return (<div className="min-h-screen bg-background"><Header /><div className="container mx-auto py-20 text-center"><div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6"><AlertCircle className="w-10 h-10 text-destructive" /></div><h1 className="font-display text-3xl mb-4">Booking Error</h1><p className="text-muted-foreground mb-6">Unable to process your booking. Please try again.</p><Button onClick={() => navigate("/exhibitions")}>Browse Exhibitions</Button></div><Footer /></div>);

  const ticketPrice = Number(selectedTicketType.price);
  const subtotal = ticketPrice * quantity;
  const platformFee = pricingBreakdown?.platformFeeAmount ?? 0;
  const gst = pricingBreakdown?.taxAmount ?? 0;
  const total = pricingBreakdown?.totalAmount ?? subtotal;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const handleNextStep = async () => {
    if (step === "tickets") {
      if (!user) {
        saveBookingDraft(exhibition.id, selectedTicketType.id, { quantity, visitDate });
        toast("Please sign in", { description: "You need an account to continue your booking." });
        navigate(`/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      if (!visitDate) {
        toast.error("Select a visit date", { description: "Please choose the date you want to attend." });
        return;
      }
      setStep("details");
    } else if (step === "details") setStep("payment");
    else if (step === "payment") {
      if (!user) {
        saveBookingDraft(exhibition.id, selectedTicketType.id, { quantity, visitDate });
        toast.error("Please sign in", { description: "Your session expired. Please sign in again to continue your booking." });
        navigate(`/auth?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      if (paymentFailed && gateway) {
        setPaymentFailed(false);
        setDialogOpen(true);
        return;
      }
      setIsSubmitting(true);
      setPaymentFailed(false);
      try {
        const { booking, payment, order } = await createBooking.mutateAsync({ exhibitionId: exhibition.id, ticketTypeId: selectedTicketType.id, attendeeName: userDetails.name, attendeeEmail: userDetails.email, attendeePhone: userDetails.phone, quantity, visitDate, idempotencyKey: getBookingIntentKey(exhibition.id, selectedTicketType.id, quantity, visitDate) });
        setBookingId(booking.id.slice(0, 8).toUpperCase());
        setFullBookingId(booking.id);
        if (payment.status === "paid" || !order) setStep("confirmation");
        else { setGateway({ payment, order }); setDialogOpen(true); }
      } catch (err) {
        toast.error("Booking failed", { description: err instanceof Error ? err.message : "Please try again." });
      } finally { setIsSubmitting(false); }
    }
  };

  const handleDownloadQr = () => {
    if (!ticketQr?.qrImage) return;
    const link = document.createElement("a");
    link.href = ticketQr.qrImage;
    link.download = `exhibittix-ticket-${bookingId || "qr"}.png`;
    link.click();
  };
  const handlePaymentSettled = (status: Payment["status"]) => { setDialogOpen(false); if (status === "paid") setStep("confirmation"); else setPaymentFailed(true); };
  const handlePrevStep = () => { if (step === "details") setStep("tickets"); else if (step === "payment") setStep("details"); else if (step === "tickets") navigate(`/exhibition/${id}`); };
  const steps = [{ id: "tickets", label: "Tickets", icon: Ticket }, { id: "details", label: "Details", icon: User }, { id: "payment", label: "Payment", icon: CreditCard }, { id: "confirmation", label: "Done", icon: Check }];
  const currentStepIndex = steps.findIndex((s) => s.id === step);
  const today = toLocalDateInputValue(new Date());
  const exhibitionStartDate = exhibition.startDate ? exhibition.startDate.split("T")[0] : today;
  const exhibitionEndDate = exhibition.endDate ? exhibition.endDate.split("T")[0] : undefined;
  const visitDateMin = exhibitionStartDate > today ? exhibitionStartDate : today;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <div className="bg-card border-b sticky top-16 lg:top-20 z-40"><div className="container mx-auto py-4"><div className="flex items-center justify-center max-w-xl mx-auto">{steps.map((s, index) => (<div key={s.id} className="flex items-center"><div className={`flex flex-col items-center ${index <= currentStepIndex ? "text-primary" : "text-muted-foreground"}`}><div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${index < currentStepIndex ? "bg-primary text-primary-foreground" : index === currentStepIndex ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}>{index < currentStepIndex ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}</div><span className="text-xs mt-1 hidden sm:block">{s.label}</span></div>{index < steps.length - 1 && <div className={`w-12 sm:w-20 h-0.5 mx-2 ${index < currentStepIndex ? "bg-primary" : "bg-border"}`} />}</div>))}</div></div></div>
      <div className="container mx-auto py-8"><div className="max-w-4xl mx-auto"><button onClick={handlePrevStep} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ChevronLeft className="w-4 h-4" /> Back</button><div className="grid lg:grid-cols-3 gap-8"><div className="lg:col-span-2"><Card className="p-6">{step === "tickets" && (<div><h1 className="font-display text-2xl font-semibold mb-2">Select Tickets</h1><p className="text-muted-foreground mb-6">{exhibition.name}</p><div className="border rounded-xl p-4 mb-6"><div className="flex items-center justify-between mb-2"><div><h3 className="font-semibold">{selectedTicketType.name}</h3><p className="text-sm text-muted-foreground">{selectedTicketType.description || "Entry ticket"}</p></div><span className="font-display text-xl">₹{ticketPrice.toLocaleString("en-IN")}</span></div><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Quantity</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}><Minus className="w-4 h-4" /></Button><span className="w-8 text-center font-medium">{quantity}</span><Button variant="outline" size="icon" onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} disabled={quantity >= maxQuantity}><Plus className="w-4 h-4" /></Button></div></div>{remainingParam > 0 && <p className="text-xs text-muted-foreground mt-3">{remainingParam} ticket{remainingParam === 1 ? "" : "s"} remaining</p>}</div><div className="space-y-2"><Label htmlFor="visit-date">Visit Date</Label><Input id="visit-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} min={visitDateMin} max={exhibitionEndDate} required /><p className="text-xs text-muted-foreground">Select a date between {formatDate(exhibition.startDate)} and {formatDate(exhibition.endDate)}</p></div><Button className="w-full mt-6" size="lg" onClick={handleNextStep} disabled={!visitDate}>Continue <ChevronLeft className="w-4 h-4 rotate-180 ml-2" /></Button></div>)}{step === "details" && (<div><h1 className="font-display text-2xl font-semibold mb-2">Your Details</h1><p className="text-muted-foreground mb-6">Enter the details for the ticket</p><div className="space-y-4"><div className="space-y-2"><Label htmlFor="name">Full Name</Label><Input id="name" value={userDetails.name} onChange={(e) => setUserDetails({ ...userDetails, name: e.target.value })} placeholder="John Doe" required /></div><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={userDetails.email} onChange={(e) => setUserDetails({ ...userDetails, email: e.target.value })} placeholder="john@example.com" required /></div><div className="space-y-2"><Label htmlFor="phone">Phone Number</Label><Input id="phone" type="tel" value={userDetails.phone} onChange={(e) => setUserDetails({ ...userDetails, phone: e.target.value })} placeholder="+91 98765 43210" required /></div></div><Button className="w-full mt-6" size="lg" onClick={handleNextStep} disabled={!userDetails.name || !userDetails.email || !userDetails.phone}>Continue <ChevronLeft className="w-4 h-4 rotate-180 ml-2" /></Button></div>)}{step === "payment" && (<div><h1 className="font-display text-2xl font-semibold mb-2">Payment</h1><p className="text-muted-foreground mb-6">Complete your payment to confirm your booking</p><div className="bg-muted/50 rounded-xl p-4 mb-6"><div className="flex justify-between mb-2"><span>Tickets ({quantity})</span><span>₹{subtotal.toLocaleString("en-IN")}</span></div><div className="flex justify-between mb-2"><span className="text-muted-foreground">Platform fee</span><span>₹{platformFee.toLocaleString("en-IN")}</span></div><div className="flex justify-between mb-2"><span className="text-muted-foreground">GST</span><span>₹{gst.toLocaleString("en-IN")}</span></div><Separator className="my-3" /><div className="flex justify-between font-semibold text-lg"><span>Total</span><span>₹{total.toLocaleString("en-IN")}</span></div></div>{paymentFailed && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 mb-4"><p className="font-medium text-destructive">Payment failed</p><p className="text-sm text-muted-foreground mt-1">Your booking is preserved. Retry payment to complete it.</p></div>}<Button className="w-full" size="lg" onClick={handleNextStep} disabled={isSubmitting}>{isSubmitting ? "Processing..." : paymentFailed ? "Retry Payment" : `Pay ₹${total.toLocaleString("en-IN")}`}</Button><div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground"><Shield className="w-3 h-3" /> Secure payment</div></div>)}{step === "confirmation" && (<div className="text-center"><div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"><Check className="w-8 h-8 text-primary" /></div><h1 className="font-display text-2xl font-semibold mb-2">Booking Confirmed!</h1><p className="text-muted-foreground mb-6">Your ticket has been confirmed successfully.</p>{ticketQr?.qrImage && <div className="w-48 h-48 mx-auto border rounded-xl p-3 mb-4"><img src={ticketQr.qrImage} alt="Your ticket QR code" className="w-full h-full" /></div>}<div className="bg-muted/50 rounded-xl p-4 text-left mb-6"><div className="flex justify-between mb-2"><span className="text-muted-foreground">Booking ID</span><span className="font-mono font-medium">{bookingId}</span></div><div className="flex justify-between mb-2"><span className="text-muted-foreground">Exhibition</span><span className="font-medium text-right">{exhibition.name}</span></div><div className="flex justify-between mb-2"><span className="text-muted-foreground">Date</span><span>{formatDate(visitDate)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Tickets</span><span>{selectedTicketType.name} × {quantity}</span></div></div><div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={handleDownloadQr} disabled={!ticketQr?.qrImage}><Download className="w-4 h-4 mr-2" /> Save QR</Button><Button className="flex-1" onClick={() => navigate(`/my-tickets/${fullBookingId}`)}>View Ticket</Button></div></div>)}</Card></div><div><Card className="p-6 sticky top-40"><h3 className="font-display font-semibold mb-4">Booking Summary</h3><div className="flex items-start gap-3 mb-4"><div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center"><Calendar className="w-6 h-6 text-muted-foreground" /></div><div><h4 className="font-medium">{exhibition.name}</h4><p className="text-sm text-muted-foreground">{exhibition.venue}</p><p className="text-sm text-muted-foreground">{exhibition.city}</p></div></div><Separator /><div className="py-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Ticket</span><span>{selectedTicketType.name}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{quantity}</span></div>{visitDate && <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(visitDate)}</span></div>}</div><Separator /><div className="pt-4 flex justify-between font-semibold"><span>Total</span><span>₹{total.toLocaleString("en-IN")}</span></div></Card></div></div></div></div><Footer /><PaymentGatewayDialog open={dialogOpen} onOpenChange={setDialogOpen} payment={gateway?.payment ?? null} order={gateway?.order ?? null} onPaymentSettled={handlePaymentSettled} /></div>
  );
};

export default BookingFlow;
