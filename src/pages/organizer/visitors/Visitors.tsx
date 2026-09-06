import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Users, Search, Filter, CheckCircle, XCircle, Mail, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganizerVisitors } from "@/hooks/organizer/useVisitors";
import type { PaymentStatus } from "@/types/exhibitor";

// Same PaymentStatus -> badge mapping already used by the exhibitor Sales
// page (src/pages/exhibitor/sales/Sales.tsx) — kept consistent rather than
// inventing a second convention for the same enum.
const statusBadge = (status: PaymentStatus) =>
  status === "paid" ? "verified" : status === "pending" ? "pending" : "suspended";

// Phase 21C (P1-1 fix): replaces the "Visitors — Coming soon" stub. Sourced
// from the same real, organizer-scoped ticket-booking data the Tickets/Sales
// pages already use — see hooks/organizer/useVisitors.ts.
export default function OrganizerVisitors() {
  const { data: bookings, isLoading, isError, refetch } = useOrganizerVisitors();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  // Lets the event workspace's "Manage this exhibition" links deep-link here
  // pre-filtered (e.g. /organizer/visitors?exhibitionId=X).
  const [exhibitionFilter, setExhibitionFilter] = useState(searchParams.get("exhibitionId") ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = bookings ?? [];
  const exhibitionOptions = useMemo(
    () => Array.from(new Map(rows.map((b) => [b.exhibitionId, b.exhibition?.name ?? "Exhibition"])).entries()),
    [rows]
  );

  const filtered = rows.filter((b) => {
    if (exhibitionFilter !== "all" && b.exhibitionId !== exhibitionFilter) return false;
    if (statusFilter === "checked" && !b.checkInStatus) return false;
    if (statusFilter === "pending" && b.checkInStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches = (b.attendeeName ?? "").toLowerCase().includes(q) || (b.attendeeEmail ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  if (isLoading) return <LoadingState label="Loading visitors..." />;
  if (isError) return <ErrorState description="Could not load visitors." onRetry={() => refetch()} />;

  const total = rows.length;
  const checkedIn = rows.filter((b) => b.checkInStatus).length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Visitors</h1>
        <p className="text-muted-foreground">Everyone who has registered for a ticket at your exhibitions</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No visitors yet" description="Once visitors book tickets to your exhibitions, they'll appear here." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-sm text-muted-foreground">Total Registered</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-2xl font-bold text-success">{checkedIn}</p>
              <p className="text-sm text-muted-foreground">Checked In</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-2xl font-bold">{total - checkedIn}</p>
              <p className="text-sm text-muted-foreground">Pending</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-2xl font-bold">{total > 0 ? Math.round((checkedIn / total) * 100) : 0}%</p>
              <p className="text-sm text-muted-foreground">Attendance Rate</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={exhibitionFilter} onValueChange={setExhibitionFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Exhibition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exhibitions</SelectItem>
                {exhibitionOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="checked">Checked In</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Visitor</th>
                  <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                  <th className="text-left p-4 text-sm font-medium">Ticket Type</th>
                  <th className="text-left p-4 text-sm font-medium">Booking Status</th>
                  <th className="text-left p-4 text-sm font-medium">Check-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-secondary/30">
                    <td className="p-4">
                      <p className="font-medium">{b.attendeeName ?? "Unknown"}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        {b.attendeeEmail && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {b.attendeeEmail}
                          </span>
                        )}
                        {b.attendeePhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {b.attendeePhone}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="p-4 text-muted-foreground">{b.exhibition?.name ?? "—"}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                        {b.ticketType?.name ?? "—"}
                      </span>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={statusBadge(b.paymentStatus)} />
                    </td>
                    <td className="p-4">
                      {b.checkInStatus ? (
                        <div className="flex items-center gap-2 text-success">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">
                            Checked in{b.checkInTime ? ` ${new Date(b.checkInTime).toLocaleString()}` : ""}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <XCircle className="w-4 h-4" />
                          <span className="text-sm">Not checked in</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No visitors match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
