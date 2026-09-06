import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganizerExhibitorsOverview, type OrganizerExhibitorRow } from "@/hooks/organizer/useOrganizerExhibitorsOverview";
import { useReviewApplication } from "@/hooks/organizer/useExhibitionExhibitors";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";

// Minimum useful cross-exhibition exhibitor view: who has applied/is
// participating, which exhibition, current status, and — for the one
// action most worth doing from here — approve/reject a pending application
// without leaving the page. Anything more detailed (booth assignment, stall
// picking, payment history) stays on the per-exhibition Exhibitors tab this
// page links out to; that page is unchanged and still works exactly as
// before.
function ReviewActions({ row, canManage }: { row: OrganizerExhibitorRow; canManage: boolean }) {
  const reviewApplication = useReviewApplication(row.exhibitionId);
  if (!canManage || row.status !== "applied") return null;
  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={reviewApplication.isPending}
        onClick={() => reviewApplication.mutate({ participantId: row.id, status: "approved" })}
      >
        <Check className="w-4 h-4 mr-1" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={reviewApplication.isPending}
        onClick={() => reviewApplication.mutate({ participantId: row.id, status: "rejected" })}
      >
        <X className="w-4 h-4 mr-1" />
        Reject
      </Button>
    </div>
  );
}

export default function OrganizerExhibitors() {
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "exhibitionExhibitor:manage");
  const { rows, exhibitions, isLoading, isError, refetch } = useOrganizerExhibitorsOverview();
  const [search, setSearch] = useState("");
  const [exhibitionFilter, setExhibitionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (exhibitionFilter !== "all" && row.exhibitionId !== exhibitionFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (search && !(row.business?.companyName ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, exhibitionFilter, statusFilter, search]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Exhibitors</h1>
        <p className="text-muted-foreground">Applications and participation across every exhibition you organize</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by business name..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={exhibitionFilter} onValueChange={setExhibitionFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All exhibitions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Exhibitions</SelectItem>
            {exhibitions.map((ex) => (
              <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="stall_reserved">Stall Reserved</SelectItem>
            <SelectItem value="payment_pending">Payment Pending</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading exhibitors..." />
      ) : isError ? (
        <ErrorState description="Couldn't load exhibitors." onRetry={() => refetch()} />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={rows.length === 0 ? "No exhibitor applications yet" : "No exhibitors match your filters"}
          description={rows.length === 0 ? "Applications will appear here once exhibitors apply to your exhibitions." : undefined}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Business</th>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Stall</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-secondary/30">
                  <td className="p-4 font-medium">{row.business?.companyName ?? "—"}</td>
                  <td className="p-4">
                    <Link to={`/organizer/exhibitions/${row.exhibitionId}`} className="text-primary hover:underline">
                      {row.exhibitionName}
                    </Link>
                  </td>
                  <td className="p-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {row.stalls?.[0]?.code ?? (row.stalls?.[0] ? row.stalls[0].id.slice(0, 6) : "—")}
                  </td>
                  <td className="p-4">
                    <ReviewActions row={row} canManage={canManage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
