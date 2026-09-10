import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { formatCurrency } from "@/lib/utils";
import { usePlatformVisitors } from "@/hooks/platform/usePlatformAdmin";

export default function PlatformVisitors() {
  const [search, setSearch] = useState("");
  const [suspended, setSuspended] = useState<string>("all");
  const { data: visitors = [], isLoading, isError, refetch } = usePlatformVisitors({
    search: search || undefined,
    suspended: suspended !== "all" ? suspended === "true" : undefined,
  });

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Visitors" />
      <div>
        <h1 className="text-2xl font-semibold">Visitors</h1>
        <p className="text-muted-foreground">Accounts that have purchased at least one ticket — only the minimum needed for support/moderation</p>
      </div>

      <div className="flex flex-wrap gap-2" role="search" aria-label="Filter visitors">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input aria-label="Search visitors by name or email" placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={suspended} onValueChange={setSuspended}>
          <SelectTrigger className="w-40" aria-label="Filter visitors by account status">
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
        <LoadingState label="Loading visitors..." />
      ) : isError ? (
        <ErrorState description="Couldn't load visitors." onRetry={() => refetch()} />
      ) : visitors.length === 0 ? (
        <EmptyState icon={Users} title="No visitors found" />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Platform visitors and their ticket, check-in, purchase, and account status information</caption>
            <thead className="bg-secondary/50">
              <tr>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Name</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Email</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Tickets</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitions</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Check-ins</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Total Spent</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Last Purchase</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Joined</th>
                <th scope="col" className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visitors.map((v) => (
                <tr key={v.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <Link to={`/platform/visitors/${v.id}`} className="font-medium hover:text-primary">
                      {v.fullName ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{v.email}</td>
                  <td className="p-3 text-muted-foreground">{v.ticketsCount}</td>
                  <td className="p-3 text-muted-foreground">{v.exhibitionsCount}</td>
                  <td className="p-3 text-muted-foreground">{v.checkInsCount}</td>
                  <td className="p-3 font-medium">{formatCurrency(v.totalSpent)}</td>
                  <td className="p-3 text-muted-foreground">{v.lastPurchase ? new Date(v.lastPurchase).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={v.suspended ? "suspended" : "active"} />
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/platform/visitors/${v.id}`} aria-label={`View visitor ${v.fullName ?? v.email}`}>
                        View <ArrowRight aria-hidden="true" className="w-3 h-3 ml-1" />
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
