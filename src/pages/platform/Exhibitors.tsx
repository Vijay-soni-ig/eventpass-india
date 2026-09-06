import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Store, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { formatCurrency } from "@/lib/utils";
import { usePlatformExhibitors, type PlatformExhibitorFilters } from "@/hooks/platform/usePlatformAdmin";

export default function PlatformExhibitors() {
  const [search, setSearch] = useState("");
  const [kycStatus, setKycStatus] = useState<string>("all");
  const [suspended, setSuspended] = useState<string>("all");

  const filters: PlatformExhibitorFilters = {
    search: search || undefined,
    kycStatus: kycStatus !== "all" ? (kycStatus as "pending" | "verified") : undefined,
    suspended: suspended !== "all" ? suspended === "true" : undefined,
  };
  const { data: exhibitors = [], isLoading, isError, refetch } = usePlatformExhibitors(filters);

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Exhibitors" />
      <div>
        <h1 className="text-2xl font-semibold">Exhibitors</h1>
        <p className="text-muted-foreground">Every exhibitor business registered on the platform</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by business or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
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
      </div>

      {isLoading ? (
        <LoadingState label="Loading exhibitors..." />
      ) : isError ? (
        <ErrorState description="Couldn't load exhibitors." onRetry={() => refetch()} />
      ) : exhibitors.length === 0 ? (
        <EmptyState icon={Store} title="No exhibitors match your filters" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Business</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Owner</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Participations</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Stalls</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Total Paid</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Outstanding</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">KYC</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Joined</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exhibitors.map((e) => (
                <tr key={e.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <Link to={`/platform/exhibitors/${e.id}`} className="font-medium hover:text-primary">
                      {e.companyName ?? "Unnamed business"}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{e.owner.fullName ?? e.owner.email}</td>
                  <td className="p-3 text-muted-foreground">{e.businessType ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{e.participationsCount}</td>
                  <td className="p-3 text-muted-foreground">{e.stallsBooked}</td>
                  <td className="p-3 font-medium">{formatCurrency(e.totalPaid)}</td>
                  <td className="p-3 text-muted-foreground">{e.outstandingAmount > 0 ? formatCurrency(e.outstandingAmount) : "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={e.kycStatus} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={e.suspended ? "suspended" : "active"} />
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/platform/exhibitors/${e.id}`}>
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
