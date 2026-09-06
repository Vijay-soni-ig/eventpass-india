import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ticket, Calendar, MapPin, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useMyTicketBookings, useTicketQr } from "@/hooks/exhibitor/useBookings";
import type { TicketBooking } from "@/types/exhibitor";

type Tab = "all" | "upcoming" | "past" | "cancelled" | "refunded";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
];

// Same real states Dashboard.tsx already established (Phase 23-era): only a
// `paid` booking is a real, scannable ticket. "Past" specifically means
// already checked in — not merely date-passed, since there is no ticket-level
// "expired" status in the schema to base that on (see the audit this phase
// started with). Kept identical here so the two ticket surfaces (this page,
// and BookingFlow's confirmation screen) never silently disagree about what
// counts as "upcoming".
function ticketBucket(b: TicketBooking): Tab {
  if (b.paymentStatus === "cancelled") return "cancelled";
  if (b.paymentStatus === "refunded" || b.paymentStatus === "partially_refunded") return "refunded";
  if (b.paymentStatus === "paid" && b.checkInStatus) return "past";
  if (b.paymentStatus === "paid") return "upcoming";
  return "all"; // created/pending/failed — real, but not upcoming/past/cancelled/refunded
}

function TicketThumbQr({ bookingId }: { bookingId: string }) {
  const { data } = useTicketQr(bookingId);
  return data?.qrImage ? (
    <img src={data.qrImage} alt="" aria-hidden="true" className="w-16 h-16" />
  ) : (
    <QrCode className="w-10 h-10 text-muted-foreground animate-pulse" aria-hidden="true" />
  );
}

function formatDate(dateString: string | null) {
  if (!dateString) return "Date TBA";
  return new Date(dateString).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function TicketCard({ booking }: { booking: TicketBooking }) {
  const bucket = ticketBucket(booking);
  const showQr = booking.paymentStatus === "paid";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {booking.exhibition?.coverImageUrl && (
          <div className="sm:w-40 shrink-0">
            <img
              src={booking.exhibition.coverImageUrl}
              alt=""
              aria-hidden="true"
              className="w-full h-32 sm:h-full object-cover"
            />
          </div>
        )}
        <CardContent className="flex-1 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <StatusBadge status={booking.paymentStatus} />
                {bucket === "past" && <StatusBadge status="checked_in" label="Checked in" />}
              </div>
              <h3 className="font-display text-lg font-semibold mb-1 truncate">
                {booking.exhibition?.name ?? "Exhibition"}
              </h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {formatDate(booking.visitDate)}
                </p>
                {(booking.exhibition?.venue || booking.exhibition?.city) && (
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {[booking.exhibition?.venue, booking.exhibition?.city].filter(Boolean).join(", ")}
                    </span>
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <Ticket className="w-3.5 h-3.5 shrink-0" />
                  {booking.ticketType?.name ?? "Ticket"} × {booking.quantity}
                </p>
              </div>
            </div>

            {showQr && (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden shrink-0">
                <TicketThumbQr bookingId={booking.id} />
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              Ref {booking.id.slice(0, 8).toUpperCase()}
            </span>
            <Button asChild size="sm">
              <Link to={`/my-tickets/${booking.id}`}>View Ticket</Link>
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

function TicketCardSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <Skeleton className="sm:w-40 h-32 rounded-none" />
        <div className="flex-1 p-5 space-y-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-24 ml-auto" />
        </div>
      </div>
    </div>
  );
}

export default function MyTickets() {
  const [tab, setTab] = useState<Tab>("all");
  const { data: bookings = [], isLoading, isError, refetch } = useMyTicketBookings();

  // Private page — must not be indexed. Same zero-dependency pattern as
  // TicketDetail.tsx / ExhibitionDetail.tsx's per-page meta overrides.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return bookings;
    return bookings.filter((b) => ticketBucket(b) === tab);
  }, [bookings, tab]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: bookings.length, upcoming: 0, past: 0, cancelled: 0, refunded: 0 };
    for (const b of bookings) {
      const bucket = ticketBucket(b);
      if (bucket !== "all") c[bucket] += 1;
    }
    return c;
  }, [bookings]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto py-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold mb-2">My Tickets</h1>
          <p className="text-muted-foreground">Manage your exhibition bookings and access your QR tickets.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-2" role="tablist" aria-label="Ticket filters">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.label}
              {counts[t.key] > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({counts[t.key]})</span>}
            </button>
          ))}
        </div>

        {isError ? (
          <ErrorState title="Couldn't load your tickets" description="Please try again." onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <TicketCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={bookings.length === 0 ? "No tickets yet" : `No ${tab === "all" ? "" : tab} tickets`}
            description={
              bookings.length === 0
                ? "You haven't booked any exhibitions yet. Start exploring!"
                : "Nothing to show in this filter yet."
            }
            action={
              <Button asChild>
                <Link to="/exhibitions">Explore Exhibitions</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => (
              <TicketCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
