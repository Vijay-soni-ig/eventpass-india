import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { usePlatformPayments } from "@/hooks/platform/usePlatformAdmin";

interface Row {
  id: string;
  amount: string | number;
  currency: string;
  provider: string | null;
  status: string;
  createdAt: string;
  ticketBooking: { id: string; exhibition: { name: string } } | null;
  stallBooking: { id: string; exhibition: { name: string } } | null;
}

const statusOptions = ["created", "pending", "paid", "failed", "cancelled", "refunded", "partially_refunded"];

export default function PlatformPayments() {
  const [status, setStatus] = useState<string>("all");
  const { data, isLoading, isError, refetch } = usePlatformPayments(status !== "all" ? status : undefined);
  const payments = (data ?? []) as Row[];

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-muted-foreground">Every payment across every organizer and exhibitor</p>
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          {statusOptions.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <LoadingState label="Loading payments..." />
      ) : isError ? (
        <ErrorState description="Couldn't load payments." onRetry={() => refetch()} />
      ) : payments.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Type</th>
                <th className="text-left p-4 text-sm font-medium">Amount</th>
                <th className="text-left p-4 text-sm font-medium">Provider</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">
                    {p.ticketBooking?.exhibition.name ?? p.stallBooking?.exhibition.name ?? "—"}
                  </td>
                  <td className="p-4 text-muted-foreground">{p.ticketBooking ? "Ticket" : p.stallBooking ? "Stall" : "—"}</td>
                  <td className="p-4">
                    {p.currency} {Number(p.amount).toLocaleString("en-IN")}
                  </td>
                  <td className="p-4 text-muted-foreground capitalize">{p.provider ?? "—"}</td>
                  <td className="p-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
