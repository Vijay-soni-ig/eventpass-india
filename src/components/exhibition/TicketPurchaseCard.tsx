import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck, Zap, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getMinTicketPrice } from "@/components/ExhibitionCard";
import type { Exhibition } from "@/types/exhibitor";

// Phase 24 — extracted from ExhibitionDetail.tsx's sidebar for structural
// reuse; the ticket-selection/pricing/availability behavior itself is
// UNCHANGED from the original implementation (same fields, same "remaining"
// stock display, same sold-out/free/completed-event states). This never
// talks to the payment gateway directly — selecting a ticket only navigates
// to the existing BookingFlow, which owns the real order/Razorpay/webhook
// path (routes/bookings.ts, routes/payments.ts) untouched by this refactor.
export function TicketPurchaseCard({ exhibition, isCompleted }: { exhibition: Exhibition; isCompleted: boolean }) {
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const ticketCardRef = useRef<HTMLDivElement>(null);

  const minPrice = getMinTicketPrice(exhibition);
  const ticketTypes = exhibition.ticketTypes ?? [];
  const selectedTicketType = ticketTypes.find((t) => t.id === selectedTicket);
  const anyTicketAvailable = ticketTypes.some((t) => (t.remaining ?? t.quantity) > 0);

  const handleBookNow = () => {
    if (!selectedTicket) return;
    const remainingParam = selectedTicketType
      ? `&remaining=${selectedTicketType.remaining ?? selectedTicketType.quantity}`
      : "";
    navigate(`/book/${exhibition.id}?ticket=${selectedTicket}${remainingParam}`);
  };

  return (
    <>
      <Card className="overflow-hidden" ref={ticketCardRef}>
        <div className="gradient-hero p-6">
          <p className="text-card/70 text-sm mb-1">Tickets from</p>
          <p className="text-3xl font-bold text-card">₹{minPrice.toLocaleString("en-IN")}</p>
        </div>

        <CardContent className="p-6">
          {isCompleted ? (
            <div className="text-center py-6">
              <p className="font-semibold text-foreground mb-1">This event has ended</p>
              <p className="text-sm text-muted-foreground">
                Ticket sales are closed. Browse other events from this organizer or discover what's on now.
              </p>
            </div>
          ) : (
            <>
              <h3 className="font-display text-lg mb-4">Select Ticket Type</h3>

              {/* Phase 23.4: each ticket option already declared role="radio"
                  but had no wrapping radiogroup — an ARIA structural gap
                  (a radio with no group context) found during this phase's
                  accessibility audit. */}
              <div className="space-y-3 mb-6" role="radiogroup" aria-label="Select ticket type">
                {ticketTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No tickets available yet.</p>
                )}
                {ticketTypes.map((ticket) => {
                  const price = Number(ticket.price);
                  const remaining = ticket.remaining ?? ticket.quantity;
                  const available = remaining > 0;
                  return (
                    <div
                      key={ticket.id}
                      role="radio"
                      aria-checked={selectedTicket === ticket.id}
                      aria-disabled={!available}
                      tabIndex={available ? 0 : -1}
                      onClick={() => available && setSelectedTicket(ticket.id)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && available) {
                          e.preventDefault();
                          setSelectedTicket(ticket.id);
                        }
                      }}
                      className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                        selectedTicket === ticket.id
                          ? "border-primary bg-primary/5"
                          : available
                          ? "border-border hover:border-primary/50"
                          : "border-border opacity-60 cursor-not-allowed"
                      }`}
                    >
                      {selectedTicket === ticket.id && (
                        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-primary-foreground" />
                        </div>
                      )}

                      <h4 className="font-semibold mb-2">{ticket.name}</h4>

                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xl font-bold">₹{price.toLocaleString("en-IN")}</span>
                      </div>

                      {!available ? (
                        <Badge variant="destructive" className="mt-3">
                          Sold Out
                        </Badge>
                      ) : (
                        remaining <= 10 && (
                          <p className="text-xs text-warning font-medium mt-1">Only {remaining} left</p>
                        )
                      )}
                    </div>
                  );
                })}
              </div>

              <Button size="lg" className="w-full" disabled={!selectedTicket} onClick={handleBookNow}>
                {selectedTicket ? "Continue to Book" : "Select a Ticket"}
              </Button>

              {/* Real, platform-wide capabilities only — not a claim about
                  THIS exhibition's specific refund terms (that's whatever
                  the organizer actually configured, shown verbatim in the
                  Policies section below rather than paraphrased here). */}
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Secure payment
                </span>
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Instant confirmation
                </span>
                <span className="flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Digital QR ticket
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mobile sticky purchase bar — hidden at `lg` and up, where the sticky
          sidebar card above already solves reachability. Hidden entirely for
          a completed event since there is no purchase action left. */}
      {!isCompleted && (
        <>
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {selectedTicketType ? selectedTicketType.name : "Tickets from"}
                </p>
                <p className="font-bold text-lg truncate">
                  ₹{(selectedTicketType ? Number(selectedTicketType.price) : minPrice).toLocaleString("en-IN")}
                </p>
              </div>
              <Button
                size="lg"
                className="shrink-0"
                disabled={!anyTicketAvailable}
                onClick={() => {
                  if (selectedTicket) handleBookNow();
                  else ticketCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                {!anyTicketAvailable ? "Sold Out" : selectedTicket ? "Continue to Book" : "Select Tickets"}
              </Button>
            </div>
          </div>
          {/* Spacer so the fixed bar above never covers content below it on mobile. */}
          <div className="lg:hidden h-20" aria-hidden="true" />
        </>
      )}
    </>
  );
}
