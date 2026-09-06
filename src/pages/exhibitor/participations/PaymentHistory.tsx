import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { usePaymentHistory } from "@/hooks/exhibitor/useParticipations";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";

export default function PaymentHistory() {
  const { id } = useParams();
  const { data: bookings = [], isLoading, isError, refetch } = usePaymentHistory(id);

  if (isLoading) return <LoadingState label="Loading payment history..." />;
  if (isError) return <ErrorState description="Couldn't load payment history." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <DashboardBreadcrumb
        items={[{ label: "My Participations", to: "/exhibitor-dashboard/participations" }]}
        page="Payment History"
      />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/exhibitor-dashboard/participations">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Payment History</h1>
          <p className="text-muted-foreground">Stall payments for this participation</p>
        </div>
      </div>

      {bookings.length === 0 ? (
        <EmptyState title="No payments yet" description="Payments will appear here once you initiate one." />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Stall</th>
                <th className="text-left p-4 text-sm font-medium">Amount</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Gateway</th>
                <th className="text-left p-4 text-sm font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-mono">{b.stall?.code ?? b.stallId.slice(0, 6)}</td>
                  <td className="p-4 font-medium">₹{Number(b.amountPaid).toLocaleString("en-IN")}</td>
                  <td className="p-4">
                    <StatusBadge status={b.payment?.status ?? b.paymentStatus} />
                  </td>
                  <td className="p-4 text-muted-foreground">{b.payment?.gateway ?? "—"}</td>
                  <td className="p-4 text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
