import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, Calendar, MapPin, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useParticipations, type ParticipationStatus } from "@/hooks/exhibitor/useParticipations";

const statusLabel: Record<ParticipationStatus, string> = {
  applied: "Applied",
  approved: "Approved",
  rejected: "Rejected",
  stall_pending: "Selecting Stall",
  stall_reserved: "Stall Reserved",
  payment_pending: "Payment Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const statusColor: Record<ParticipationStatus, string> = {
  applied: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/20 text-primary",
  rejected: "bg-destructive/20 text-destructive",
  stall_pending: "bg-warning/20 text-warning",
  stall_reserved: "bg-warning/20 text-warning",
  payment_pending: "bg-warning/20 text-warning",
  confirmed: "bg-success/20 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

// Phase 21B (P0-2 fix): this page previously read the organizer-scoped
// /api/exhibitions list (always empty for a pure exhibitor account, and its
// "Create Exhibition" CTA silently bootstrapped an unwanted Organizer
// identity — see section 5 of the Phase 21B brief). It now shows exactly
// what an exhibitor actually owns: their own participations.
export default function ExhibitionsList() {
  const { data: participations, isLoading, isError, refetch } = useParticipations();
  const [statusFilter, setStatusFilter] = useState<"all" | ParticipationStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (isLoading) return <LoadingState label="Loading your exhibitions..." />;
  if (isError) return <ErrorState description="Could not load your exhibitions." onRetry={() => refetch()} />;

  const rows = participations ?? [];
  const filtered = rows.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (searchQuery && !(p.exhibition?.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Exhibitions</h1>
        <p className="text-muted-foreground">Exhibitions your business participates in</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search exhibitions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(statusLabel) as ParticipationStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No exhibitions found"
          description="Once you apply to exhibit at an event, it will appear here. Browse live exhibitions to apply."
          action={
            <Link to="/exhibitions" className="text-primary underline text-sm">
              Browse exhibitions
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-7 h-7 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link
                        to={`/exhibition/${p.exhibitionId}`}
                        className="font-semibold hover:text-primary transition-colors"
                      >
                        {p.exhibition?.name ?? "Exhibition"}
                      </Link>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[p.status]}`}>
                        {statusLabel[p.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {p.exhibition?.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {p.exhibition.city}
                        </span>
                      )}
                      {p.exhibition?.startDate && p.exhibition?.endDate && (
                        <>
                          <span>•</span>
                          <span>
                            {new Date(p.exhibition.startDate).toLocaleDateString()} -{" "}
                            {new Date(p.exhibition.endDate).toLocaleDateString()}
                          </span>
                        </>
                      )}
                      {p.boothNumber && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Store className="w-3.5 h-3.5" />
                            Stall {p.boothNumber}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <Link
                  to="/exhibitor-dashboard/participations"
                  className="text-sm text-primary hover:underline whitespace-nowrap"
                >
                  Manage participation
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
