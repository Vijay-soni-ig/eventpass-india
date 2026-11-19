import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Building2, CreditCard, Store, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  useParticipations,
  useSelectStall,
  useInitiatePayment,
  useCancelParticipation,
  useParticipationFloorPlans,
  useParticipationAddOns,
  type Participation,
  type ParticipationAddOn,
} from "@/hooks/exhibitor/useParticipations";
import { usePublicExhibition } from "@/hooks/usePublicExhibitions";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission, hasExhibitorPermissionForBusiness } from "@/lib/permissions";
import { PaymentGatewayDialog } from "@/components/payments/PaymentGatewayDialog";
import FloorPlanStallPicker from "@/components/exhibitor/FloorPlanStallPicker";
import { HallPlans } from "@/components/floorplan/HallPlans";
import type { Payment, PaymentOrder } from "@/hooks/usePayments";
import type { StallBooking } from "@/types/exhibitor";

const statusCopy: Record<Participation["status"], string> = {
  applied: "Awaiting organizer approval",
  approved: "Approved — select a stall to continue",
  rejected: "Your application was not accepted",
  stall_pending: "Select a stall to continue",
  stall_reserved: "Stall reserved — proceed to payment",
  payment_pending: "Payment in progress — complete it below, or it's awaiting organizer confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

function StallPicker({ participation, onClose }: { participation: Participation; onClose: () => void }) {
  // The List view keeps reading from `usePublicExhibition` unchanged (it
  // already filters to available stalls and is the accessible/simple
  // fallback), while the Map view reads the new participation-scoped
  // floor-plan endpoint. They're two read paths into the same underlying
  // availability data, both funneled into the same `useSelectStall`
  // mutation below.
  const {
    data: exhibition,
    isLoading: exhibitionLoading,
    isError: exhibitionError,
    refetch: refetchExhibition,
  } = usePublicExhibition(participation.exhibitionId);
  const {
    data: floorPlans,
    isLoading: floorPlanLoading,
    isError: floorPlanError,
    refetch: refetchFloorPlan,
  } = useParticipationFloorPlans(participation.id);
  const selectStall = useSelectStall();
  const [view, setView] = useState<"map" | "list">("map");

  // Refetch-before-reserve: pull fresh availability the moment the picker
  // opens rather than trusting whatever was cached from page load — the
  // concrete, honest version of "don't show stale data at the moment of
  // choosing" (no polling/websockets involved).
  useEffect(() => {
    refetchExhibition();
    refetchFloorPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableStalls = (exhibition?.stalls ?? []).filter((s) => s.status === "available");
  const hasMap = !!floorPlans && floorPlans.length > 0;
  const isLoading = exhibitionLoading || floorPlanLoading;

  const handleSelect = (stallId: string) => {
    selectStall.mutate(
      { id: participation.id, stallId },
      {
        onSuccess: () => {
          toast.success("Stall reserved");
          onClose();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Failed to reserve stall");
          // A 409 here means the stall was taken by someone else since the
          // picker opened (or since the last refetch) — refetch so both
          // views immediately show the corrected state instead of leaving
          // a now-stale "available" tile clickable.
          if (err instanceof ApiError && err.status === 409) {
            refetchExhibition();
            refetchFloorPlan();
          }
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select a Stall</DialogTitle>
        </DialogHeader>
        {hasMap && !isLoading && (
          <div className="flex justify-end">
            <Tabs value={view} onValueChange={(v) => setView(v as "map" | "list")}>
              <TabsList>
                <TabsTrigger value="map">Map</TabsTrigger>
                <TabsTrigger value="list">List</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
        {isLoading ? (
          <LoadingState label="Loading stalls..." />
        ) : exhibitionError ? (
          <ErrorState
            title="Couldn't load stall availability"
            description="The current stall list could not be loaded. Retry before selecting a stall so you don't act on stale availability."
            onRetry={() => {
              void Promise.all([refetchExhibition(), refetchFloorPlan()]);
            }}
          />
        ) : floorPlanError && view === "map" ? (
          <div className="space-y-3">
            <ErrorState
              title="Couldn't load the floor plan"
              description="You can retry the floor plan or switch to the stall list while the map is unavailable."
              onRetry={() => refetchFloorPlan()}
            />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setView("list")}>Use stall list</Button>
            </div>
          </div>
        ) : hasMap && view === "map" ? (
          <HallPlans floorPlans={floorPlans}>
            {(plan) => <FloorPlanStallPicker floorPlan={plan} onSelectStall={handleSelect} selecting={selectStall.isPending} />}
          </HallPlans>
        ) : availableStalls.length === 0 ? (
          <EmptyState icon={Store} title="No stalls available" description="Check back later or contact the organizer." />
        ) : (
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {availableStalls.map((stall) => (
              <button
                key={stall.id}
                onClick={() => handleSelect(stall.id)}
                disabled={selectStall.isPending}
                className="text-left rounded-lg border-2 border-border hover:border-primary/50 p-4 transition-colors disabled:opacity-50"
              >
                <p className="font-mono font-semibold">{stall.code ?? stall.id.slice(0, 6)}</p>
                <p className="text-xs text-muted-foreground">{stall.stallType} {stall.size}</p>
                <p className="text-sm font-medium mt-1">₹{Number(stall.price).toLocaleString("en-IN")}</p>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddOnPickerDialog({
  participation,
  onClose,
  onContinue,
  pending,
}: {
  participation: Participation;
  onClose: () => void;
  onContinue: (selections: Array<{ addOnId: string; quantity: number }>) => void;
  pending: boolean;
}) {
  const { data: addOns = [], isLoading, isError, refetch } = useParticipationAddOns(participation.id);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    setQuantities({});
  }, [participation.id]);

  const selections = addOns
    .map((item) => ({ addOnId: item.id, quantity: quantities[item.id] ?? 0 }))
    .filter((item) => item.quantity > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Optional booking add-ons</DialogTitle>
          <DialogDescription>
            Choose optional services for {participation.exhibition?.name ?? "your exhibition"}.
            The final prices and quantities are verified by the server.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingState label="Loading available add-ons..." />
        ) : isError ? (
          <ErrorState
            title="Couldn't load booking add-ons"
            description="Retry before continuing so the booking review includes every available optional service."
            onRetry={() => void refetch()}
          />
        ) : addOns.length === 0 ? (
          <EmptyState title="No optional add-ons available" description="You can continue with the stall booking without extras." />
        ) : (
          <div className="space-y-3">
            {addOns.map((item: ParticipationAddOn) => (
              <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                    <p className="text-sm font-medium mt-1">
                      ₹{Number(item.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Maximum {item.maxQuantityPerBooking} per booking</p>
                  </div>
                  <div className="w-24 shrink-0">
                    <label className="text-xs text-muted-foreground" htmlFor={`addon-quantity-${item.id}`}>Quantity</label>
                    <Input
                      id={`addon-quantity-${item.id}`}
                      type="number"
                      min={0}
                      max={item.maxQuantityPerBooking}
                      step={1}
                      value={quantities[item.id] ?? 0}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setQuantities((current) => ({
                          ...current,
                          [item.id]: Number.isInteger(value) ? Math.min(Math.max(value, 0), item.maxQuantityPerBooking) : 0,
                        }));
                      }}
                      disabled={pending}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={() => onContinue(selections)} disabled={isLoading || isError || pending}>
            {pending ? "Preparing booking..." : "Continue to booking review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MyParticipations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = hasExhibitorPermission(user?.roles, "exhibitionExhibitor:manage");
  const canViewFinancials = (businessId: string) => hasExhibitorPermissionForBusiness(user?.roles, businessId, "exhibitorPayment:view");
  const { data: participations = [], isLoading, isError, refetch } = useParticipations();
  const initiatePayment = useInitiatePayment();
  const cancelParticipation = useCancelParticipation();

  const [stallPickerFor, setStallPickerFor] = useState<Participation | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [gateway, setGateway] = useState<{ payment: Payment; order: PaymentOrder } | null>(null);
  const [addOnPickerFor, setAddOnPickerFor] = useState<Participation | null>(null);
  const [bookingReview, setBookingReview] = useState<{ booking: StallBooking; payment: Payment; order: PaymentOrder; participation: Participation } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const startPayment = (id: string, addOns: Array<{ addOnId: string; quantity: number }>) => {
    initiatePayment.mutate({ id, addOns }, {
      onSuccess: ({ booking, payment, order, alreadyPaid }) => {
        setAddOnPickerFor(null);
        if (alreadyPaid || !order) {
          toast.success("This participation has already been paid for.");
          return;
        }
        const currentParticipation = participations.find((item) => item.id === id);
        if (!currentParticipation) {
          toast.error("Booking details are no longer available. Refresh your participations and try again.");
          return;
        }
        setTermsAccepted(false);
        setBookingReview({ booking, payment, order, participation: currentParticipation });
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to initiate payment");
        if (err instanceof ApiError && err.status === 409) {
          void queryClient.invalidateQueries({ queryKey: ["participations", id, "add-ons"] });
        }
      },
    });
  };

  const handlePay = (participation: Participation) => {
    // An in-flight payment is immutable: resume its existing order and saved
    // add-on snapshot instead of allowing a second selection to change it.
    if (participation.status === "payment_pending") {
      startPayment(participation.id, []);
      return;
    }
    setAddOnPickerFor(participation);
  };

  const handlePaymentSettled = (status: Payment["status"]) => {
    if (status === "paid") toast.success("Payment verified — your participation is now confirmed.");
    else toast.error("Payment failed. No charge was confirmed — you can try again.");
    setGateway(null);

    // Initiating payment invalidates this query before the gateway result is
    // known. Reconcile again after the server-confirmed outcome so the
    // participation status, available actions, and payment history reflect
    // the canonical database state without requiring a manual page refresh.
    void queryClient.invalidateQueries({ queryKey: ["participations"] });
  };

  const handleCancel = () => {
    if (!cancelId) return;
    cancelParticipation.mutate(cancelId, {
      onSuccess: () => {
        toast.success("Participation cancelled");
        setCancelId(null);
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to cancel");
        setCancelId(null);
      },
    });
  };

  if (isLoading) return <LoadingState label="Loading your applications..." />;
  if (isError) return <ErrorState description="Couldn't load your applications." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">My Participations</h1>
        <p className="text-muted-foreground">Track your exhibition applications from apply to confirmed stall</p>
      </div>

      {participations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No applications yet"
          description="Browse exhibitions and apply to participate as an exhibitor."
          action={
            <Button asChild>
              <Link to="/exhibitions">Browse Exhibitions</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {participations.map((p) => {
            const reservedStall = p.stalls?.[0];
            const cancellable = ["applied", "stall_reserved"].includes(p.status);
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{p.exhibition?.name ?? "Exhibition"}</h3>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {p.exhibition?.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {p.exhibition.city}
                        </span>
                      )}
                      {p.exhibition?.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(p.exhibition.startDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage && p.status === "approved" && (
                      <Button size="sm" onClick={() => setStallPickerFor(p)}>
                        <Store className="w-4 h-4 mr-2" />
                        Select Stall
                      </Button>
                    )}
                    {canManage && (p.status === "stall_reserved" || p.status === "payment_pending") && (
                      <Button size="sm" onClick={() => handlePay(p)} disabled={initiatePayment.isPending}>
                        <CreditCard className="w-4 h-4 mr-2" />
                        {initiatePayment.isPending
                          ? "Loading..."
                          : p.status === "payment_pending"
                            ? "Review booking & pay"
                            : "Review booking"}
                      </Button>
                    )}
                    {canManage && cancellable && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelId(p.id)}>
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{statusCopy[p.status]}</p>

                {p.status === "payment_pending" && (
                  <div className="flex items-center gap-2 text-sm bg-warning/10 text-warning border border-warning/20 rounded-lg p-3">
                    <Clock className="w-4 h-4 flex-shrink-0" />
                    Payment cannot be marked successful from this page — the organizer confirms receipt on their end.
                  </div>
                )}

                {reservedStall && (
                  <div className="flex items-center gap-3 text-sm bg-muted/50 rounded-lg p-3">
                    <Store className="w-4 h-4 text-primary" />
                    <span>
                      Stall <span className="font-mono font-medium">{reservedStall.code ?? reservedStall.id.slice(0, 6)}</span>
                      {p.boothNumber ? ` · Stall ${p.boothNumber}` : ""} — ₹{Number(reservedStall.price).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}

                {["confirmed", "payment_pending"].includes(p.status) && canViewFinancials(p.exhibitorBusinessId) && (
                  <Link
                    to={`/exhibitor-dashboard/participations/${p.id}/payments`}
                    className="text-sm text-primary hover:underline inline-block"
                  >
                    View payment history →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stallPickerFor && <StallPicker participation={stallPickerFor} onClose={() => setStallPickerFor(null)} />}

      {addOnPickerFor && (
        <AddOnPickerDialog
          participation={addOnPickerFor}
          onClose={() => setAddOnPickerFor(null)}
          onContinue={(selections) => startPayment(addOnPickerFor.id, selections)}
          pending={initiatePayment.isPending}
        />
      )}

      {bookingReview && (
        <Dialog open onOpenChange={(open) => !open && setBookingReview(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review your stall booking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="font-semibold">{bookingReview.participation.exhibition?.name ?? "Exhibition"}</p>
                <p className="text-sm text-muted-foreground">
                  {bookingReview.participation.exhibition?.venue ?? ""}
                  {bookingReview.participation.exhibition?.city ? `, ${bookingReview.participation.exhibition.city}` : ""}
                </p>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                  <div>
                    <p className="text-sm text-muted-foreground">Reserved stall</p>
                    <p className="font-mono font-semibold">
                      {bookingReview.participation.stalls?.[0]?.code ?? bookingReview.participation.stalls?.[0]?.id.slice(0, 6) ?? "Stall"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bookingReview.participation.stalls?.[0]?.stallType ?? "Exhibition"} · {bookingReview.participation.stalls?.[0]?.size ?? "Size not specified"}
                    </p>
                  </div>
                  <p className="font-semibold">
                    ₹{Number(bookingReview.participation.stalls?.[0]?.price ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
                <h3 className="font-semibold">Price breakdown</h3>
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Stall price</span><span>₹{Number(bookingReview.participation.stalls?.[0]?.price ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                {(bookingReview.booking.addOnItems ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{item.name} × {item.quantity}</span>
                    <span>₹{Number(item.lineTotal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-border pt-2">
                  <span className="text-muted-foreground">Booking subtotal</span>
                  <span>₹{Number(bookingReview.payment.baseAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {Number(bookingReview.payment.platformFeeAmount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Platform fee {bookingReview.payment.feePaidBy === "organizer" ? "(paid by organizer)" : ""}</span>
                    <span>₹{Number(bookingReview.payment.platformFeeAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {Number(bookingReview.payment.taxAmount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Tax</span><span>₹{Number(bookingReview.payment.taxAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                )}
                {Number(bookingReview.payment.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">Discount</span><span>−₹{Number(bookingReview.payment.discountAmount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                )}
                <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold">
                  <span>Total payable</span>
                  <span>₹{Number(bookingReview.payment.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {bookingReview.payment.currency}</span>
                </div>
                {Number(bookingReview.payment.gatewayFeeAmount ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">Gateway processing cost is tracked separately and is not added to your payable total.</p>
                )}
              </div>

              {bookingReview.participation.exhibition?.refundPolicy && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                  <h3 className="text-sm font-semibold">Refund policy</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bookingReview.participation.exhibition.refundPolicy}</p>
                </div>
              )}
              {bookingReview.participation.exhibition?.terms && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                  <h3 className="text-sm font-semibold">Booking terms</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bookingReview.participation.exhibition.terms}</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                    <span>I have read and agree to the booking terms.</span>
                  </label>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setBookingReview(null)}>Review later</Button>
                <Button
                  onClick={() => {
                    if (!bookingReview.order) return;
                    setGateway({ payment: bookingReview.payment, order: bookingReview.order });
                    setBookingReview(null);
                  }}
                  disabled={!!bookingReview.participation.exhibition?.terms && !termsAccepted}
                >
                  Continue to payment
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Your stall reservation remains subject to its reservation expiry. Payment confirmation is recorded only after the server verifies the payment result.</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {gateway && (
        <PaymentGatewayDialog
          open
          onClose={() => setGateway(null)}
          payment={gateway.payment}
          order={gateway.order}
          onSettled={handlePaymentSettled}
        />
      )}

      <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this participation?</AlertDialogTitle>
            <AlertDialogDescription>
              If you had a stall reserved, it will be released back to the available pool. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>Cancel Participation</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
