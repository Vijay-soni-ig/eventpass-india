import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Ticket, User, QrCode, Info, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useTicketBooking, useTicketQr } from "@/hooks/exhibitor/useBookings";

function formatDate(dateString: string | null) {
  if (!dateString) return "Date to be announced";
  return new Date(dateString).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const TICKET_RULE_COPY: Record<string, string> = {
  paid: "This ticket is valid for entry at the exhibition and date shown above.",
  created: "This ticket isn't confirmed yet — payment hasn't been completed.",
  pending: "This ticket isn't confirmed yet — payment is still processing.",
  failed: "Payment for this ticket failed. It cannot be used for entry.",
  cancelled: "This ticket has been cancelled and cannot be used for entry.",
  refunded: "This ticket has been refunded and cannot be used for entry.",
  partially_refunded: "This ticket was partially refunded. Contact support for details.",
};

export default function TicketDetail() {
  const { ticketId } = useParams();
  const { data: booking, isLoading, isError, refetch } = useTicketBooking(ticketId);
  const { data: qr } = useTicketQr(booking?.paymentStatus === "paid" ? booking.id : undefined);

  // UI-04 — private page, must not be indexed. Same zero-dependency
  // save-and-restore pattern already used by ExhibitionDetail.tsx for its
  // per-page meta overrides, rather than introducing react-helmet.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 max-w-2xl">
          <LoadingState label="Loading your ticket..." />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 max-w-2xl">
          {/* Deliberately generic — the backend returns the same 404 whether
              this ticket doesn't exist or belongs to someone else, so this
              page never implies "that ticket exists, but isn't yours". */}
          <ErrorState
            title="Ticket unavailable"
            description="This ticket doesn't exist or isn't available to you."
            onRetry={() => refetch()}
          />
          <div className="text-center mt-4">
            <Link to="/my-tickets" className="text-primary text-sm hover:underline">
              Back to My Tickets
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const exhibition = booking.exhibition;
  const isPaid = booking.paymentStatus === "paid";
  const qrAltText = `Ticket QR code for ${exhibition?.name ?? "your exhibition"}, ticket reference ${booking.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto py-8 max-w-2xl">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to My Tickets
        </Link>

        {/* The ticket itself */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden mb-8">
          <div className="p-6 text-center border-b border-dashed border-border">
            <div className="flex items-center justify-center gap-2 mb-4">
              <StatusBadge status={booking.paymentStatus} />
              {isPaid && booking.checkInStatus && <StatusBadge status="checked_in" label="Checked in" />}
            </div>

            <div className="w-48 h-48 mx-auto rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden mb-2">
              {isPaid ? (
                qr?.qrImage ? (
                  <img src={qr.qrImage} alt={qrAltText} className="w-full h-full object-contain" />
                ) : (
                  <div role="status" aria-label="Loading QR code" className="flex flex-col items-center gap-2">
                    <QrCode className="w-16 h-16 text-muted-foreground animate-pulse" aria-hidden="true" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
                  <QrCode className="w-12 h-12 opacity-40" aria-hidden="true" />
                  <span className="text-xs">No QR — {TICKET_RULE_COPY[booking.paymentStatus] ?? "this ticket isn't active."}</span>
                </div>
              )}
            </div>
            {isPaid && <p className="text-xs text-muted-foreground">Show this QR code at the entrance</p>}
          </div>

          <div className="p-6 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold mb-1">{exhibition?.name ?? "Exhibition"}</h1>
              <p className="text-muted-foreground">{booking.ticketType?.name ?? "Ticket"}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Visitor</p>
                  <p className="font-medium">{booking.attendeeName ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Date</p>
                  <p className="font-medium">{formatDate(booking.visitDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Venue</p>
                  <p className="font-medium">
                    {[exhibition?.venue, exhibition?.city].filter(Boolean).join(", ") || "To be announced"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <Ticket className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-muted-foreground text-xs">Ticket Reference</p>
                  <p className="font-mono font-medium">{booking.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Event information */}
        {exhibition && (
          <div className="rounded-xl border border-border p-6 mb-6">
            <h2 className="font-display text-lg font-semibold mb-3">Event Information</h2>
            {exhibition.description && <p className="text-sm text-muted-foreground mb-4">{exhibition.description}</p>}
            <Button asChild variant="outline" size="sm">
              <Link to={`/exhibition/${exhibition.id}`}>View Exhibition Details</Link>
            </Button>
          </div>
        )}

        {/* Ticket rules / status explanation */}
        <div className="rounded-xl border border-border p-6 mb-6">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Ticket Rules
          </h2>
          <p className="text-sm text-muted-foreground">
            {TICKET_RULE_COPY[booking.paymentStatus] ?? "Check your ticket status above for details."}
          </p>
        </div>

        {/* Support / refund policy — no cancel/refund action here, since no
            visitor-initiated cancellation or refund API exists today (see
            UI-04 report). Pointing at the real, existing support paths
            instead of a non-functional button. */}
        <div className="rounded-xl border border-border p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <LifeBuoy className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Need to cancel or ask about a refund?</p>
              <p className="text-xs text-muted-foreground">Contact support — refund requests are handled by our team.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link to="/refund-policy">Refund Policy</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/contact">Contact Support</Link>
            </Button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
