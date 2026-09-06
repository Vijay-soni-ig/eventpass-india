import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Landmark, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { formatCurrency } from "@/lib/utils";
import { usePlatformOrganizers, type PlatformOrganizerFilters } from "@/hooks/platform/usePlatformAdmin";

export default function PlatformOrganizers() {
  const [search, setSearch] = useState("");
  const [suspended, setSuspended] = useState<string>("all");
  const [kycStatus, setKycStatus] = useState<string>("all");

  const filters: PlatformOrganizerFilters = {
    search: search || undefined,
    suspended: suspended !== "all" ? suspended === "true" : undefined,
    kycStatus: kycStatus !== "all" ? (kycStatus as "pending" | "verified") : undefined,
  };
  const { data: organizers = [], isLoading, isError, refetch } = usePlatformOrganizers(filters);

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Organizers" />
      <div>
        <h1 className="text-2xl font-semibold">Organizers</h1>
        <p className="text-muted-foreground">Every organizer tenant on the platform</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search organizers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={suspended} onValueChange={setSuspended}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kycStatus} onValueChange={setKycStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="KYC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All KYC</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading organizers..." />
      ) : isError ? (
        <ErrorState description="Couldn't load organizers." onRetry={() => refetch()} />
      ) : organizers.length === 0 ? (
        <EmptyState icon={Landmark} title="No organizers found" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Primary Contact</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitions</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Visitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Plan</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ticket Revenue</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Stall Revenue</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Joined</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizers.map((o) => (
                <tr key={o.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <Link to={`/platform/organizers/${o.id}`} className="font-medium hover:text-primary">
                      {o.name}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {o.contact?.email ? (
                      <div>
                        <p className="text-sm">{o.contact.name ?? "—"}</p>
                        <p className="text-xs">{o.contact.email}</p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{o._count.exhibitions}</td>
                  <td className="p-3 text-muted-foreground">{o.exhibitorsCount ?? 0}</td>
                  <td className="p-3 text-muted-foreground">{o.visitorsCount ?? 0}</td>
                  <td className="p-3 text-muted-foreground">{o.subscription ? o.subscription.planName : "—"}</td>
                  <td className="p-3 font-medium">{formatCurrency(o.ticketRevenue ?? 0)}</td>
                  <td className="p-3 font-medium">{formatCurrency(o.stallRevenue ?? 0)}</td>
                  <td className="p-3">
                    <StatusBadge status={o.kycStatus} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={o.suspended ? "suspended" : "active"} />
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/platform/organizers/${o.id}`}>
                        View <ArrowRight className="w-3 h-3 ml-1" />
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
