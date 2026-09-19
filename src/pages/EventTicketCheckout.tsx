import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, CreditCard, Minus, Plus, ShieldCheck, Ticket, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { PaymentGatewayDialog } from "@/components/payments/PaymentGatewayDialog";
import type { Payment, PaymentOrder } from "@/hooks/usePayments";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/apiClient";
import { toast } from "sonner";

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  currency: string;
  capacity: number;
  maxPerOrder: number;
  maxPerAttendee: number | null;
  remaining: number;
  soldOut: boolean;
};
type TicketResponse = {
  event: {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    timezone: string;
    venue: string | null;
    city: string | null;
    coverImageUrl: string | null;
  };
  ticketTypes: TicketType[];
};
type CheckoutStep = "select" | "details" | "payment" | "confirmed";

export default function EventTicketCheckout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<TicketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<CheckoutStep>("select");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [attendee, setAttendee] = useState({ name: user?.fullName ?? "", email: user?.email ?? "", phone: user?.phone ?? "" });
  const [submitting, setSubmitting] = useState(false);
  const [gateway, setGateway] = useState<{ payment: Payment; order: PaymentOrder } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState("");
  const reservationKey = useRef(crypto.randomUUID());
  const orderKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!id) return;
    api.get<TicketResponse>(`/api/public/events/${id}/tickets`)
      .then((response) => {
        setData(response);
        const first = response.ticketTypes.find((ticket) => !ticket.soldOut);
        if (first) setSelectedId(first.id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load ticket types."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (user) {
      setAttendee((current) => ({
        name: current.name || user.fullName || "",
        email: current.email || user.email || "",
        phone: current.phone || user.phone || "",
      }));
    }
  }, [user]);

  const selected = data?.ticketTypes.find((ticket) => ticket.id === selectedId);
  const maxQuantity = selected ? Math.min(selected.maxPerOrder, selected.remaining) : 1;
  const total = selected ? Number(selected.price) * quantity : 0;

  const refreshTickets = async () => {
    if (!id) return;
    const response = await api.get<TicketResponse>(`/api/public/events/${id}/tickets`);
    setData(response);
    const current = response.ticketTypes.find((ticket) => ticket.id === selectedId);
    if (current && current.remaining < quantity) setQuantity(Math.max(1, current.remaining));
  };

  const beginCheckout = () => {
    if (!user) {
      toast("Please sign in", { description: "An account is required to reserve and purchase an event ticket." });
      navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!selected || selected.soldOut) return;
    setStep("details");
  };

  const createReservationAndOrder = async () => {
    if (!id || !selected) return;
    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setSubmitting(true);
    try {
      const reservation = await api.post<{ reservation: { id: string; expiresAt: string }; expiresInSeconds: number }>(
        "/api/event-ticket-reservations",
        { eventTicketTypeId: selected.id, attendeeName: attendee.name, attendeeEmail: attendee.email, attendeePhone: attendee.phone || undefined, quantity },
        { "Idempotency-Key": reservationKey.current },
      );
      const created = await api.post<{ order: { id: string; status: string }; payment: Payment; checkout: PaymentOrder | null }>(
        "/api/event-ticket-orders",
        { reservationId: reservation.reservation.id },
        { "Idempotency-Key": orderKey.current },
      );
      setConfirmedOrderId(created.order.id);
      if (created.payment.status === "paid" || !created.checkout) {
        setStep("confirmed");
      } else {
        setGateway({ payment: created.payment, order: created.checkout });
        setDialogOpen(true);
        setStep("payment");
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Checkout could not be started.";
      toast.error("Checkout failed", { description: message });
      await refreshTickets().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettled = (status: Payment["status"]) => {
    setDialogOpen(false);
    if (status === "paid") setStep("confirmed");
    else {
      setStep("details");
      setGateway(null);
      reservationKey.current = crypto.randomUUID();
      orderKey.current = crypto.randomUUID();
      toast.error("Payment failed", { description: "No payment was confirmed. Please start a new checkout attempt." });
      refreshTickets().catch(() => undefined);
    }
  };

  if (loading) return <div className="min-h-screen"><Header/><main className="container mx-auto px-4 py-10 space-y-5"><Skeleton className="h-10 w-2/3"/><Skeleton className="h-72 w-full"/><Skeleton className="h-40 w-full"/></main><Footer/></div>;
  if (error || !data) return <div className="min-h-screen"><Header/><main className="container mx-auto py-20"><ErrorState title="Tickets unavailable" description={error || "This event is no longer available."} onRetry={() => window.location.reload()}/></main><Footer/></div>;
  if (data.ticketTypes.length === 0) return <div className="min-h-screen"><Header/><main className="container mx-auto py-20 px-4 text-center"><Ticket className="mx-auto h-12 w-12 text-muted-foreground mb-4"/><h1 className="text-2xl font-semibold">Tickets are not on sale</h1><p className="text-muted-foreground mt-2">There are no active ticket types available for this event.</p><Button asChild className="mt-6"><Link to={`/event/${data.event.id}`}>Back to event</Link></Button></main><Footer/></div>;

  return <div className="min-h-screen bg-muted/30"><Header/>
    <main className="container mx-auto px-4 py-8">
      <Link to={`/event/${data.event.id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="h-4 w-4"/>Back to event</Link>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Get your tickets</CardTitle>
              <p className="text-sm text-muted-foreground">{data.event.title}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {step === "select" && <>
                <div className="space-y-3">
                  {data.ticketTypes.map((ticket) => <button key={ticket.id} type="button" disabled={ticket.soldOut} onClick={() => { setSelectedId(ticket.id); setQuantity(1); }} className={`w-full text-left rounded-xl border p-4 transition ${selectedId === ticket.id ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/50"} ${ticket.soldOut ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="font-semibold">{ticket.name}</p>{ticket.description && <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>}<p className="text-xs text-muted-foreground mt-2">{ticket.soldOut ? "Sold out" : `${ticket.remaining} available`}</p></div>
                      <p className="text-lg font-bold whitespace-nowrap">{ticket.price === 0 || Number(ticket.price) === 0 ? "Free" : `₹${Number(ticket.price).toLocaleString("en-IN")}`}</p>
                    </div>
                  </button>)}
                </div>
                {selected && <div className="rounded-xl bg-muted/50 p-4">
                  <div className="flex items-center justify-between"><span className="font-medium">Quantity</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}><Minus className="h-4 w-4"/></Button><span className="w-8 text-center font-semibold">{quantity}</span><Button variant="outline" size="icon" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={quantity >= maxQuantity}><Plus className="h-4 w-4"/></Button></div></div>
                  <p className="text-xs text-muted-foreground mt-2">Maximum {maxQuantity} per order for this ticket type.</p>
                </div>}
                <Button className="w-full" size="lg" onClick={beginCheckout} disabled={!selected || selected.soldOut}>Continue</Button>
              </>}

              {step === "details" && <>
                <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/10 p-4"><User className="h-5 w-5 text-primary"/><div><p className="font-medium">{user ? "Signed in" : "Sign in required"}</p><p className="text-sm text-muted-foreground">{user ? user.email : "You will be redirected to sign in before reservation."}</p></div></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div><Label htmlFor="attendee-name">Full name</Label><Input id="attendee-name" className="mt-2" value={attendee.name} onChange={(e) => setAttendee({...attendee,name:e.target.value})} maxLength={200}/></div>
                  <div><Label htmlFor="attendee-email">Email</Label><Input id="attendee-email" type="email" className="mt-2" value={attendee.email} onChange={(e) => setAttendee({...attendee,email:e.target.value})} maxLength={254}/></div>
                  <div><Label htmlFor="attendee-phone">Phone <span className="text-muted-foreground">(optional)</span></Label><Input id="attendee-phone" type="tel" className="mt-2" value={attendee.phone} onChange={(e) => setAttendee({...attendee,phone:e.target.value})} maxLength={20}/></div>
                </div>
                <div className="rounded-lg border p-4 text-sm text-muted-foreground flex gap-3"><Clock className="h-4 w-4 mt-0.5 shrink-0"/>Your ticket is held for 10 minutes while you complete payment.</div>
                <div className="flex gap-3"><Button variant="outline" onClick={() => setStep("select")}>Back</Button><Button className="flex-1" onClick={createReservationAndOrder} disabled={submitting || !attendee.name.trim() || !attendee.email.includes("@")}>{submitting ? "Reserving…" : "Continue to payment"}</Button></div>
              </>}

              {step === "payment" && <div className="py-6 text-center"><CreditCard className="mx-auto h-10 w-10 text-primary mb-3"/><h2 className="font-semibold text-lg">Complete payment</h2><p className="text-sm text-muted-foreground mt-1">Your reservation is held while the payment gateway is open.</p><Button className="mt-5" onClick={() => setDialogOpen(true)}>Open payment</Button></div>}

              {step === "confirmed" && <div className="py-10 text-center"><div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center"><Check className="h-7 w-7 text-primary"/></div><h2 className="text-2xl font-semibold mt-4">Ticket confirmed</h2><p className="text-muted-foreground mt-2">Your payment has been verified. Your ticket will appear in your account.</p><div className="rounded-lg border p-4 mt-6 text-left max-w-md mx-auto"><p className="text-xs text-muted-foreground">Order ID</p><p className="font-mono text-sm break-all">{confirmedOrderId}</p></div><Button asChild className="mt-6"><Link to="/my-tickets">Go to My Tickets</Link></Button></div>}
            </CardContent>
          </Card>
        </div>
        <aside><Card className="sticky top-24"><CardHeader><CardTitle>Order summary</CardTitle></CardHeader><CardContent className="space-y-4">
          {data.event.coverImageUrl && <img src={data.event.coverImageUrl} alt="" className="w-full h-32 rounded-lg object-cover"/>}
          <div><p className="font-semibold">{selected?.name ?? "Select a ticket"}</p><p className="text-sm text-muted-foreground">{quantity} × ₹{selected ? Number(selected.price).toLocaleString("en-IN") : "0"}</p></div>
          <div className="border-t pt-4 flex justify-between font-semibold"><span>Total</span><span>{total === 0 ? "Free" : `₹${total.toLocaleString("en-IN")}`}</span></div>
          <div className="text-xs text-muted-foreground space-y-2"><p className="flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0"/>Server-verified payment</p><p className="flex gap-2"><Clock className="h-4 w-4 shrink-0"/>10-minute reservation hold</p></div>
        </CardContent></Card></aside>
      </div>
    </main>
    {gateway && <PaymentGatewayDialog open={dialogOpen} onClose={() => setDialogOpen(false)} payment={gateway.payment} order={gateway.order} onSettled={handleSettled}/>}
    <Footer/>
  </div>;
}
