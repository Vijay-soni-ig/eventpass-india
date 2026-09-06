import { CreditCard, Store, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useMyStallPayments } from "@/hooks/exhibitor/useParticipations";
import type { PaymentStatus } from "@/types/exhibitor";

export default function Sales() {
  const stallPayments = useMyStallPayments();

  if (stallPayments.isLoading) return <LoadingState label="Loading your stall payments..." />;
  if (stallPayments.isError) {
    return <ErrorState description="Could not load your stall payments." onRetry={() => stallPayments.refetch()} />;
  }

  const bookings = stallPayments.data ?? [];
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  const totalPaid = bookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const refunded = bookings.filter((b) => b.paymentStatus === "refunded");
  const refundAmount = refunded.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

  const statusBadge = (status: PaymentStatus) =>
    status === "paid" ? "verified" : status === "pending" || status === "created" ? "pending" : "suspended";

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
          description="Once you reserve and pay for a stall, your payment history will appear here. Exhibitors don't collect visitor ticket revenue — that belongs to the event organizer — this page tracks what you've paid for your own stalls."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Sales</h1>
        <p className="text-muted-foreground">Your own stall payments across every exhibition — not visitor ticket revenue, which belongs to the organizer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Paid" value={formatCurrency(totalPaid)} icon={CreditCard} />
        <StatCard title="Stalls Booked" value={bookings.length} icon={Store} />
        <StatCard
          title="Refunds"
          value={formatCurrency(refundAmount)}
          change={`${refunded.length} refunds processed`}
          changeType={refunded.length > 0 ? "negative" : "neutral"}
          icon={TrendingUp}
        />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Stall Payment History</h3>
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
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">{b.exhibition?.name ?? "—"}</td>
                  <td className="p-4 text-muted-foreground">{b.stall?.code ?? "—"}</td>
                  <td className="p-4 text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="p-4 font-medium">
                    {b.paymentStatus === "refunded" ? (
                      <span className="text-destructive flex items-center gap-1">
                        <ArrowDownRight className="w-3 h-3" />
                        -{formatCurrency(Number(b.amountPaid))}
                      </span>
                    ) : (
                      <span className="text-success flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" />
                        {formatCurrency(Number(b.amountPaid))}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <StatusBadge status={statusBadge(b.paymentStatus)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
