import { DollarSign, Ticket, Store, TrendingUp, ArrowUpRight, ArrowDownRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useTicketBookings, useStallBookings } from "@/hooks/exhibitor/useBookings";
import type { PaymentStatus } from "@/types/exhibitor";

export default function Sales() {
  const { data: exhibitions = [] } = useExhibitions();
  const { data: ticketBookings = [] } = useTicketBookings();
  const { data: stallBookings = [] } = useStallBookings();

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  const ticketRevenue = ticketBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const stallRevenue = stallBookings.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
  const totalRevenue = ticketRevenue + stallRevenue;
  const totalTransactions = ticketBookings.length + stallBookings.length;
  const refunded = [...ticketBookings, ...stallBookings].filter((b) => b.paymentStatus === "refunded");
  const refundAmount = refunded.reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);

  const exhibitionMap = new Map(exhibitions.map((e) => [e.id, e]));

  const revenueByExhibition = exhibitions
    .map((e) => {
      const revenue =
        ticketBookings.filter((b) => b.exhibitionId === e.id).reduce((sum, b) => sum + Number(b.amountPaid || 0), 0) +
        stallBookings.filter((b) => b.exhibitionId === e.id).reduce((sum, b) => sum + Number(b.amountPaid || 0), 0);
      return { exhibition: e, revenue };
    })
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  type Transaction = {
    id: string;
    type: "ticket" | "stall";
    description: string;
    amount: number;
    status: PaymentStatus;
    date: string;
  };

  const transactions: Transaction[] = [
    ...ticketBookings.map((b) => ({
      id: `ticket-${b.id}`,
      type: "ticket" as const,
      description: `${b.ticketType?.name ?? "Ticket"} x${b.quantity} - ${exhibitionMap.get(b.exhibitionId)?.name ?? ""}`,
      amount: Number(b.amountPaid || 0),
      status: b.paymentStatus,
      date: b.createdAt,
    })),
    ...stallBookings.map((b) => ({
      id: `stall-${b.id}`,
      type: "stall" as const,
      description: `Stall ${b.stall?.code ?? ""} - ${exhibitionMap.get(b.exhibitionId)?.name ?? ""}`,
      amount: Number(b.amountPaid || 0),
      status: b.paymentStatus,
      date: b.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  const statusBadge = (status: PaymentStatus) =>
    status === "paid" ? "verified" : status === "pending" ? "pending" : "suspended";

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sales Dashboard</h1>
          <p className="text-muted-foreground">Overview of all your sales and transactions</p>
        </div>
        <Button variant="outline" disabled title="Export not implemented yet">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={DollarSign} />
        <StatCard
          title="Ticket Revenue"
          value={formatCurrency(ticketRevenue)}
          change={`${totalTransactions} transactions`}
          icon={Ticket}
        />
        <StatCard
          title="Stall Revenue"
          value={formatCurrency(stallRevenue)}
          change={`${stallBookings.length} stalls sold`}
          icon={Store}
        />
        <StatCard
          title="Refunds"
          value={formatCurrency(refundAmount)}
          change={`${refunded.length} refunds processed`}
          changeType={refunded.length > 0 ? "negative" : "neutral"}
          icon={TrendingUp}
        />
      </div>

      {/* Revenue by Exhibition */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">Revenue by Exhibition</h3>
        <div className="space-y-4">
          {revenueByExhibition.map(({ exhibition, revenue }) => (
            <div key={exhibition.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{exhibition.name}</p>
                <p className="text-sm text-muted-foreground">{exhibition.city}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(revenue)}</p>
              </div>
            </div>
          ))}
          {revenueByExhibition.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No revenue yet.</p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Description</th>
                <th className="text-left p-4 text-sm font-medium">Type</th>
                <th className="text-left p-4 text-sm font-medium">Date</th>
                <th className="text-left p-4 text-sm font-medium">Amount</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">{tx.description}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        tx.type === "ticket" ? "bg-primary/20 text-primary" : "bg-accent text-accent-foreground"
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</td>
                  <td className="p-4 font-medium">
                    {tx.status === "refunded" ? (
                      <span className="text-destructive flex items-center gap-1">
                        <ArrowDownRight className="w-3 h-3" />
                        -{formatCurrency(tx.amount)}
                      </span>
                    ) : (
                      <span className="text-success flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" />
                        +{formatCurrency(tx.amount)}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <StatusBadge status={statusBadge(tx.status)} />
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
