import { useMemo, useState } from "react";
import { CreditCard, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import {
  useOrganizerPayments,
  type StallPaymentRow,
  type TicketPaymentRow,
} from "@/hooks/organizer/useOrganizerPayments";
import { RefundDialog } from "@/components/organizer/payments/RefundDialog";

type Row = {
  paymentId: string | null;
  type: "ticket" | "stall";
  who: string;
  exhibitionName: string;
  what: string;
  amount: string | number;
  status: string;
  createdAt: string;
};

function toRows(bookings: StallPaymentRow[], ticketBookings: TicketPaymentRow[]): Row[] {
  const stallRows: Row[] = bookings.map((b) => ({
    paymentId: b.payment?.id ?? null,
    type: "stall",
    who: b.exhibitionExhibitor?.business.companyName ?? "—",
    exhibitionName: b.exhibition.name,
    what: b.stall?.code ? `Stall ${b.stall.code}` : "Stall",
    amount: b.payment?.amount ?? b.amountPaid,
    status: b.payment?.status ?? b.paymentStatus,
    createdAt: b.createdAt,
  }));
  const ticketRows: Row[] = ticketBookings.map((b) => ({
    paymentId: b.payment?.id ?? null,
    type: "ticket",
    who: b.attendeeName ?? b.attendeeEmail ?? "—",
    exhibitionName: b.exhibition.name,
    what: b.ticketType?.name ?? "Ticket",
    amount: b.payment?.amount ?? b.amountPaid,
    status: b.payment?.status ?? b.paymentStatus,
    createdAt: b.createdAt,
  }));
  return [...ticketRows, ...stallRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function OrganizerPayments() {
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "payment:manage");
  const { data, isLoading, isError, refetch } = useOrganizerPayments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refundTarget, setRefundTarget] = useState<string | null>(null);

  const rows = useMemo(() => (data ? toRows(data.bookings, data.ticketBookings) : []), [data]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (search && !row.who.toLowerCase().includes(search.toLowerCase()) && !row.exhibitionName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  if (isLoading) return <LoadingState label="Loading payments..." />;
  if (isError) return <ErrorState description="Could not load payments." onRetry={refetch} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-muted-foreground">Ticket and stall payments across every exhibition you organize</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or exhibition..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="partially_refunded">Partially refunded</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments found" description="Payments will appear here once visitors book tickets or exhibitors pay for stalls." />
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Exhibition</th>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((row, idx) => (
                <tr key={row.paymentId ?? idx}>
                  <td className="px-4 py-3 capitalize">{row.type}</td>
                  <td className="px-4 py-3">{row.who}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.exhibitionName}</td>
                  <td className="px-4 py-3">{row.what}</td>
                  <td className="px-4 py-3">₹{Number(row.amount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && row.paymentId && Number(row.amount) > 0 && (row.status === "paid" || row.status === "partially_refunded") ? (
                      <Button size="sm" variant="outline" onClick={() => setRefundTarget(row.paymentId)}>
                        Refund
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {refundTarget && <RefundDialog paymentId={refundTarget} onClose={() => setRefundTarget(null)} />}
    </div>
  );
}
