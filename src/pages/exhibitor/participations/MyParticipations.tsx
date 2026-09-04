import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Building2, CreditCard, Store, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  useParticipations,
  useSelectStall,
  useInitiatePayment,
  useCancelParticipation,
  type Participation,
} from "@/hooks/exhibitor/useParticipations";
import { usePublicExhibition } from "@/hooks/usePublicExhibitions";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";
import { PaymentGatewayDialog } from "@/components/payments/PaymentGatewayDialog";
import type { Payment, PaymentOrder } from "@/hooks/usePayments";

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
  const { data: exhibition, isLoading } = usePublicExhibition(participation.exhibitionId);
  const selectStall = useSelectStall();

  const availableStalls = (exhibition?.stalls ?? []).filter((s) => s.status === "available");

  const handleSelect = (stallId: string) => {
    selectStall.mutate(
      { id: participation.id, stallId },
      {
        onSuccess: () => {
          toast.success("Stall reserved");
          onClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reserve stall"),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a Stall</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <LoadingState label="Loading stalls..." />
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

export default function MyParticipations() {
  const { user } = useAuth();
  const canManage = hasExhibitorPermission(user?.roles, "exhibitionExhibitor:manage");
  const { data: participations = [], isLoading, isError, refetch } = useParticipations();
  const initiatePayment = useInitiatePayment();
  const cancelParticipation = useCancelParticipation();

  const [stallPickerFor, setStallPickerFor] = useState<Participation | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [gateway, setGateway] = useState<{ payment: Payment; order: PaymentOrder } | null>(null);

  const handlePay = (id: string) => {
    initiatePayment.mutate(id, {
      onSuccess: ({ payment, order }) => setGateway({ payment, order }),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to initiate payment"),
    });
  };

  const handlePaymentSettled = (status: Payment["status"]) => {
    if (status === "paid") toast.success("Payment verified — your participation is now confirmed.");
    else toast.error("Payment failed. No charge was confirmed — you can try again.");
    setGateway(null);
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
            const cancellable = ["applied", "approved", "stall_reserved", "payment_pending"].includes(p.status);
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
                      <Button size="sm" onClick={() => handlePay(p.id)} disabled={initiatePayment.isPending}>
                        <CreditCard className="w-4 h-4 mr-2" />
                        {initiatePayment.isPending
                          ? "Loading..."
                          : p.status === "payment_pending"
                            ? "Complete Payment"
                            : "Proceed to Payment"}
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
                      {p.boothNumber ? ` · Booth ${p.boothNumber}` : ""} — ₹{Number(reservedStall.price).toLocaleString("en-IN")}
                    </span>
                  </div>
                )}

                {p.status === "confirmed" && (
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
