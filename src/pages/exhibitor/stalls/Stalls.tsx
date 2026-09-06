import { useMemo, useState } from "react";
import { Store, Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useParticipations } from "@/hooks/exhibitor/useParticipations";

// Phase 21C (P1-3 fix): this page previously read the organizer-scoped
// useExhibitions() hook — always empty for a pure exhibitor account, exactly
// the same defect class fixed for Exhibitions/Tickets/Sales/Attendees in
// Phase 21B (see docs/PHASE_21B_EXHIBITOR_WORKFLOW_REPAIR_REPORT.md §14,
// "Known Limitations"). An exhibitor's own stalls are the ones allocated to
// their own participations (Stall.exhibitionExhibitorId), never the
// exhibition's full inventory (which would leak other exhibitors' stall
// assignments and organizer-only inventory data). The "Layout Editor" CTA,
// which called organizer-only stall create/update/delete endpoints, was
// removed along with its now-orphaned page (StallEditor.tsx) for the same
// accidental-organizer-capability reason CreateExhibition/CreateTicket were
// removed in Phase 21B.
export default function Stalls() {
  const { data: participations, isLoading, isError, refetch } = useParticipations();
  const [search, setSearch] = useState("");
  const [exhibitionFilter, setExhibitionFilter] = useState("all");

  const rows = useMemo(
    () =>
      (participations ?? []).flatMap((p) =>
        (p.stalls ?? []).map((stall) => ({
          ...stall,
          exhibitionId: p.exhibitionId,
          exhibitionName: p.exhibition?.name ?? "Exhibition",
          participationStatus: p.status,
        }))
      ),
    [participations]
  );

  if (isLoading) return <LoadingState label="Loading your stalls..." />;
  if (isError) return <ErrorState description="Could not load your stalls." onRetry={() => refetch()} />;

  const exhibitionOptions = Array.from(new Map(rows.map((r) => [r.exhibitionId, r.exhibitionName])).entries());

  const filteredStalls = rows.filter((stall) => {
    if (exhibitionFilter !== "all" && stall.exhibitionId !== exhibitionFilter) return false;
    if (search && !(stall.code ?? stall.id).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stalls</h1>
          <p className="text-muted-foreground">Stalls allocated to your business</p>
        </div>
        <Button variant="outline" disabled title="Export not implemented yet">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No stalls yet"
          description="Once your application is approved and you select a stall, it will appear here."
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search stalls..."
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
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Stall</th>
                  <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                  <th className="text-left p-4 text-sm font-medium">Type</th>
                  <th className="text-left p-4 text-sm font-medium">Size</th>
                  <th className="text-left p-4 text-sm font-medium">Price</th>
                  <th className="text-left p-4 text-sm font-medium">Participation</th>
                  <th className="text-left p-4 text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStalls.map((stall) => (
                  <tr key={stall.id} className="hover:bg-secondary/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                          <Store className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-mono font-medium">{stall.code ?? stall.id.slice(0, 6)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{stall.exhibitionName}</td>
                    <td className="p-4">{stall.stallType}</td>
                    <td className="p-4">{stall.size}</td>
                    <td className="p-4 font-medium">{formatCurrency(Number(stall.price))}</td>
                    <td className="p-4 text-muted-foreground capitalize">{stall.participationStatus.replace(/_/g, " ")}</td>
                    <td className="p-4">
                      <StatusBadge status={stall.status} />
                    </td>
                  </tr>
                ))}
                {filteredStalls.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No stalls match your filters.
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
