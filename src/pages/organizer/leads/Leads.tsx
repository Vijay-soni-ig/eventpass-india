import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Filter, Download, Target, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useOrganizerLeads, exportOrganizerLeads, type LeadStatus } from "@/hooks/organizer/useOrganizerLeads";

const statusOptions: LeadStatus[] = ["new", "contacted", "interested", "negotiation", "converted", "lost"];

// Phase 21C (P1-2 fix): the organizer "Leads" surface was previously
// analytics-only (aggregate charts, see Analytics.tsx, still reachable at
// /organizer/leads/analytics) — an organizer could not see an individual
// lead, its contact details, or export the underlying list, despite this
// exact data being fully available to exhibitors for their own leads. This
// page adds the missing list/search/filter/export, scoped by the new
// organizer-side lead:view/lead:export grant (see server/src/routes/organizerLeads.ts) —
// never by widening exhibitor-side lead isolation.
export default function OrganizerLeads() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  // Lets the event workspace's "Manage this exhibition" links deep-link here
  // pre-filtered (e.g. /organizer/leads?exhibitionId=X).
  const [exhibitionFilter, setExhibitionFilter] = useState(searchParams.get("exhibitionId") ?? "all");
  const [exporting, setExporting] = useState(false);

  const { data: leads, isLoading, isError, refetch } = useOrganizerLeads(
    statusFilter === "all" ? {} : { status: statusFilter }
  );

  const rows = leads ?? [];
  const exhibitionOptions = useMemo(
    () => Array.from(new Map(rows.map((l) => [l.exhibitionExhibitor.exhibition.id, l.exhibitionExhibitor.exhibition.name])).entries()),
    [rows]
  );

  const filtered = rows.filter((lead) => {
    if (exhibitionFilter !== "all" && lead.exhibitionExhibitor.exhibition.id !== exhibitionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches =
        (lead.visitorName ?? "").toLowerCase().includes(q) ||
        (lead.visitorEmail ?? "").toLowerCase().includes(q) ||
        (lead.exhibitionExhibitor.business.companyName ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportOrganizerLeads(statusFilter === "all" ? {} : { status: statusFilter });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export leads");
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <LoadingState label="Loading leads..." />;
  if (isError) return <ErrorState description="Could not load leads." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-muted-foreground">Leads captured by exhibitors across your exhibitions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/organizer/leads/analytics">
              <BarChart3 className="w-4 h-4 mr-2" />
              View Analytics
            </Link>
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting || rows.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Once exhibitors at your exhibitions start capturing leads, they'll appear here."
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by visitor name, email, or exhibitor..."
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
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-40">
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
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-4 text-sm font-medium">Visitor</th>
                  <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                  <th className="text-left p-4 text-sm font-medium">Exhibitor Business</th>
                  <th className="text-left p-4 text-sm font-medium">Status</th>
                  <th className="text-left p-4 text-sm font-medium">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((lead) => (
                  <tr key={lead.id} className="hover:bg-secondary/30">
                    <td className="p-4">
                      <Link to={`/organizer/leads/${lead.id}`} className="font-medium hover:text-primary transition-colors">
                        {lead.visitorName ?? lead.ticketBooking?.attendeeName ?? "Unknown"}
                      </Link>
                      <p className="text-sm text-muted-foreground">{lead.visitorEmail ?? lead.ticketBooking?.attendeeEmail ?? "—"}</p>
                    </td>
                    <td className="p-4 text-muted-foreground">{lead.exhibitionExhibitor.exhibition.name}</td>
                    <td className="p-4 text-muted-foreground">{lead.exhibitionExhibitor.business.companyName ?? "—"}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary capitalize">
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">{new Date(lead.capturedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No leads match your filters.
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
