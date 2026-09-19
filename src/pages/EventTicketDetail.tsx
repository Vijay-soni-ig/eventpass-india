import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, QrCode, Ticket, User } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { api } from "@/lib/apiClient";

type TicketDetail = { id: string; eventTitle: string; eventDescription: string | null; eventStartDate: string | null; eventEndDate: string | null; venue: string | null; city: string | null; coverImageUrl: string | null; ticketTypeName: string; attendeeName: string; attendeeEmail: string; ticketCode: string; status: string; orderStatus: string; orderTotalAmount: string | number; currency: string; };
type QrResponse = { qrImage: string; ticketCode: string };

export default function EventTicketDetail() {
  const { ticketId } = useParams();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["event-ticket", ticketId], queryFn: () => api.get<{ ticket: TicketDetail }>("/api/event-tickets/" + ticketId), enabled: !!ticketId });
  const { data: qr } = useQuery({ queryKey: ["event-ticket-qr", ticketId], queryFn: () => api.get<QrResponse>("/api/event-tickets/" + ticketId + "/qr"), enabled: !!ticketId && data?.ticket.status === "ACTIVE" });
  if (isLoading) return <><Header /><div className="container mx-auto py-10 max-w-2xl"><Skeleton className="h-96 w-full" /></div><Footer /></>;
  if (isError || !data?.ticket) return <><Header /><div className="container mx-auto py-10 max-w-2xl"><ErrorState title="Ticket unavailable" description="This ticket does not exist or is not available to you." onRetry={() => refetch()} /><div className="text-center mt-4"><Link to="/my-tickets" className="text-primary text-sm hover:underline">Back to My Tickets</Link></div></div><Footer /></>;
  const t = data.ticket;
  const date = t.eventStartDate ? new Date(t.eventStartDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date TBA";
  return <div className="min-h-screen bg-background"><Header /><main className="container mx-auto py-8 max-w-2xl">
    <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="w-4 h-4" />Back to My Tickets</Link>
    <Card className="overflow-hidden">
      {t.coverImageUrl && <img src={t.coverImageUrl} alt="" aria-hidden="true" className="w-full h-40 object-cover" />}
      <div className="p-6 text-center border-b border-dashed border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">{t.status}</div>
        <div className="w-56 h-56 mx-auto mt-5 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-white">
          {t.status === "ACTIVE" && qr?.qrImage ? <img src={qr.qrImage} alt={"QR code for " + t.eventTitle + ", ticket " + t.ticketCode} className="w-full h-full object-contain" /> : <QrCode className="w-20 h-20 text-muted-foreground" aria-hidden="true" />}
        </div>
        {t.status === "ACTIVE" && <p className="text-xs text-muted-foreground mt-3">Show this QR code at the event entrance.</p>}
      </div>
      <div className="p-6 space-y-5">
        <div><h1 className="font-display text-2xl font-semibold">{t.eventTitle}</h1><p className="text-muted-foreground">{t.ticketTypeName}</p></div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="flex gap-2"><User className="w-4 h-4 text-primary mt-0.5" /><div><p className="text-xs text-muted-foreground">Attendee</p><p className="font-medium">{t.attendeeName}</p></div></div>
          <div className="flex gap-2"><Calendar className="w-4 h-4 text-primary mt-0.5" /><div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{date}</p></div></div>
          <div className="flex gap-2 sm:col-span-2"><MapPin className="w-4 h-4 text-primary mt-0.5" /><div><p className="text-xs text-muted-foreground">Venue</p><p className="font-medium">{[t.venue, t.city].filter(Boolean).join(", ") || "To be announced"}</p></div></div>
          <div className="flex gap-2 sm:col-span-2"><Ticket className="w-4 h-4 text-primary mt-0.5" /><div><p className="text-xs text-muted-foreground">Ticket reference</p><p className="font-mono font-medium">{t.ticketCode}</p></div></div>
        </div>
      </div>
    </Card>
  </main><Footer /></div>;
}
