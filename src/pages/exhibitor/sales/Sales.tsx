import { CreditCard, Store, TrendingUp, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useMyStallPayments } from "@/hooks/exhibitor/useParticipations";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";

export default function Sales() {
  const { user } = useAuth();
  const canViewFinancials = hasExhibitorPermission(user?.roles, "exhibitorPayment:view");
  const stallPayments = useMyStallPayments({ enabled: canViewFinancials });

  if (!canViewFinancials) {
    return <EmptyState icon={CreditCard} title="Financial access restricted" description="Only exhibitor owners and admins can view stall payment history." />;
  }

  if (stallPayments.isLoading) return <LoadingState label="Loading your stall payments..." />;
  if (stallPayments.isError) {
    return <ErrorState description="Could not load your stall payments." onRetry={() => stallPayments.refetch()} />;
  }

  const bookings = stallPayments.data?.bookings ?? [];
  const summary = stallPayments.data?.summary;
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;



  if (bookings.length === 0) {
    return (
      <div className="space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="text-muted-foreground">Your own stall payments across every exhibition</p>
        </div>
        <EmptyState
          icon={CreditCard}
          title="No stall payments yet"
          description="Once you reserve and pay for a stall, your payment history will appear here. Exhibitors don't collect visitor ticket revenue — that belongs to the event organizer."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-muted-foreground">Your stall-payment ledger across all exhibitions. Only successfully collected payments count toward spend.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Gross Paid" value={formatCurrency(summary?.grossPaid ?? 0)} icon={CreditCard} />
        <StatCard title="Net Stall Spend" value={formatCurrency(summary?.netSpend ?? 0)} icon={Store} />
        <StatCard
          title="Refunded"
          value={formatCurrency(summary?.refundedAmount ?? 0)}
          change={`${summary?.refundedBookingCount ?? 0} bookings with refunds`}
          changeType={(summary?.refundedAmount ?? 0) > 0 ? "negative" : "neutral"}
          icon={TrendingUp}
        />
        <StatCard
          title="Pending Payments"
          value={formatCurrency(summary?.pendingAmount ?? 0)}
          change={`${summary?.pendingBookingCount ?? 0} awaiting settlement`}
          changeType={(summary?.pendingBookingCount ?? 0) > 0 ? "negative" : "neutral"}
          icon={Clock}
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Stall Payment History</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {summary?.paidBookingCount ?? 0} paid bookings · {summary?.failedBookingCount ?? 0} failed or cancelled attempts
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Stall</th>
                <th className="text-left p-4 text-sm font-medium">Date</th>
                <th className="text-left p-4 text-sm font-medium">Amount</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((booking) => {
                const status = booking.payment?.status ?? booking.paymentStatus;
                const gross = Number(booking.payment?.amount ?? booking.amountPaid ?? 0);
                const refunded = status === "refunded" ? gross : Number(booking.payment?.refundedAmount ?? 0);
                const net = Math.max(0, gross - refunded);
                const successfullyCollected = status === "paid" || status === "partially_refunded" || status === "refunded";

                return (
                  <tr key={booking.id} className="hover:bg-secondary/30">
                    <td className="p-4 font-medium">{booking.exhibition?.name ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{booking.stall?.code ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{new Date(booking.createdAt).toLocaleDateString()}</td>
                    <td className="p-4 font-medium">
                      {successfullyCollected ? (
                        <span className="text-success flex items-center gap-1">
                          {refunded > 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                          {formatCurrency(net)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{formatCurrency(gross)} <span className="text-xs">(not collected)</span></span>
                      )}
                      {refunded > 0 && <p className="text-xs text-destructive mt-1">{formatCurrency(refunded)} refunded</p>}
                    </td>
                    <td className="p-4"><StatusBadge status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
