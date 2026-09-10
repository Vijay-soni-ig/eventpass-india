import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Calendar, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { formatCurrency } from "@/lib/utils";
import { usePlatformExhibitions, type PlatformExhibitionFilters } from "@/hooks/platform/usePlatformAdmin";

const STATUS_OPTIONS = ["draft", "live", "paused", "completed"] as const;

export default function PlatformExhibitions() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filters: PlatformExhibitionFilters = {
    search: search || undefined,
    city: city || undefined,
    status: status !== "all" ? status : undefined,
  };
  const { data: exhibitions = [], isLoading, isError, refetch } = usePlatformExhibitions(filters);

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Exhibitions" />
      <div>
        <h1 className="text-2xl font-semibold">Exhibitions</h1>
        <p className="text-muted-foreground">Every exhibition across every organizer</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search exhibitions"
            placeholder="Search exhibitions..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          aria-label="Filter exhibitions by city"
          placeholder="City"
          className="w-40"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter exhibitions by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading exhibitions..." />
      ) : isError ? (
        <ErrorState description="Couldn't load exhibitions." onRetry={() => refetch()} />
      ) : exhibitions.length === 0 ? (
        <EmptyState icon={Calendar} title="No exhibitions match your filters" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">
              Exhibitions with organizer, location, schedule, capacity, sales, revenue, status, and available actions.
            </caption>
            <thead className="bg-secondary/50">
              <tr>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">City</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Dates</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Stalls</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitors</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Tickets Sold</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Revenue</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exhibitions.map((e) => (
                <tr key={e.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <Link to={`/platform/exhibitions/${e.id}`} className="font-medium hover:text-primary">
                      {e.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    <Link to={`/platform/organizers/${e.organizer.id}`} className="hover:text-primary">
                      {e.organizer.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.city ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{e.startDate ? new Date(e.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {e.bookedStalls}/{e.totalStalls}
                  </td>
                  <td className="p-3 text-muted-foreground">{e.exhibitorsCount}</td>
                  <td className="p-3 text-muted-foreground">{e.ticketsSold}</td>
                  <td className="p-3 font-medium">{formatCurrency(e.ticketRevenue + e.stallRevenue)}</td>
                  <td className="p-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/platform/exhibitions/${e.id}`} aria-label={`View exhibition ${e.name}`}>
                        View <ArrowRight className="w-3 h-3 ml-1" aria-hidden="true" />
                      </Link>
                    </Button>
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
