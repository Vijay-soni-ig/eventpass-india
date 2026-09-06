import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Store, Search, Filter, Download, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";

export default function Stalls() {
  const { data: exhibitions = [], isLoading, isError, refetch } = useExhibitions();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  // Lets the event workspace's "Manage this exhibition" links deep-link here
  // pre-filtered (e.g. /organizer/stalls?exhibitionId=X), without changing
  // how this page fetches or filters data otherwise.
  const [exhibitionFilter, setExhibitionFilter] = useState(searchParams.get("exhibitionId") ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  const allStalls = useMemo(
    () =>
      exhibitions.flatMap((exhibition) =>
        (exhibition.stalls ?? []).map((stall) => ({ ...stall, exhibitionId: exhibition.id, exhibitionName: exhibition.name }))
      ),
    [exhibitions]
  );

  const filteredStalls = allStalls.filter((stall) => {
    if (exhibitionFilter !== "all" && stall.exhibitionId !== exhibitionFilter) return false;
    if (statusFilter !== "all" && stall.status !== statusFilter) return false;
    if (search && !(stall.code ?? stall.id).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stallStats = {
    total: allStalls.length,
    sold: allStalls.filter((s) => s.status === "sold").length,
    reserved: allStalls.filter((s) => s.status === "reserved").length,
    available: allStalls.filter((s) => s.status === "available").length,
  };

  const layoutExhibitionId = exhibitionFilter !== "all" ? exhibitionFilter : exhibitions[0]?.id;
  const layoutExhibitionName = exhibitions.find((e) => e.id === layoutExhibitionId)?.name ?? "Select an exhibition";
  const layoutStalls = allStalls.filter((s) => s.exhibitionId === layoutExhibitionId);

  if (isLoading) return <LoadingState label="Loading stalls..." />;
  if (isError) return <ErrorState description="Couldn't load stalls." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stalls</h1>
          <p className="text-muted-foreground">Stall inventory and bookings across all exhibitions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" disabled title="Export not implemented yet">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button asChild disabled={!layoutExhibitionId}>
            <Link to={layoutExhibitionId ? `/organizer/exhibitions/${layoutExhibitionId}` : "#"}>
              <Grid3X3 className="w-4 h-4 mr-2" />
              Manage Layout
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{stallStats.total}</p>
          <p className="text-sm text-muted-foreground">Total Stalls</p>
        </div>
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-success">{stallStats.sold}</p>
          <p className="text-sm text-muted-foreground">Sold</p>
        </div>
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-warning">{stallStats.reserved}</p>
          <p className="text-sm text-muted-foreground">Reserved</p>
        </div>
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-primary">{stallStats.available}</p>
          <p className="text-sm text-muted-foreground">Available</p>
        </div>
      </div>

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
            {exhibitions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
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
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="reserved">Reserved</SelectItem>
            <SelectItem value="available">Available</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-primary" />
            Stall Layout
          </h3>
          <p className="text-sm text-muted-foreground">{layoutExhibitionName}</p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {layoutStalls.map((stall) => (
            <div
              key={stall.id}
              className={`aspect-square rounded-lg p-3 border-2 transition-all ${
                stall.status === "sold"
                  ? "bg-success/10 border-success/30"
                  : stall.status === "reserved"
                  ? "bg-warning/10 border-warning/30"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              <p className="font-mono font-bold text-sm">{stall.code ?? stall.id.slice(0, 6)}</p>
              <p className="text-xs text-muted-foreground mt-1">{stall.size}</p>
              {stall.buyerName && <p className="text-xs truncate mt-2 font-medium">{stall.buyerName}</p>}
            </div>
          ))}
          {layoutStalls.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground text-center py-6">No stalls configured.</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              <th className="text-left p-4 text-sm font-medium">Stall ID</th>
              <th className="text-left p-4 text-sm font-medium">Exhibition</th>
              <th className="text-left p-4 text-sm font-medium">Type</th>
              <th className="text-left p-4 text-sm font-medium">Size</th>
              <th className="text-left p-4 text-sm font-medium">Price</th>
              <th className="text-left p-4 text-sm font-medium">Buyer</th>
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
                <td className="p-4 text-muted-foreground">{stall.buyerName || "—"}</td>
                <td className="p-4">
                  <StatusBadge status={stall.status} />
                </td>
              </tr>
            ))}
            {filteredStalls.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No stalls found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
