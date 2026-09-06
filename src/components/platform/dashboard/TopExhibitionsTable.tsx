import { Link } from "react-router-dom";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import type { PlatformTopExhibition } from "@/hooks/platform/usePlatformAdmin";

export function TopExhibitionsTable({ exhibitions }: { exhibitions: PlatformTopExhibition[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Top Performing Exhibitions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by revenue in the selected period</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
          <Link to="/platform/exhibitions">
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>

      {exhibitions.length === 0 ? (
        <EmptyState icon={Calendar} title="No exhibition revenue in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibition</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Visitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Revenue</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {exhibitions.map((e) => (
                <tr key={e.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <Link to={`/platform/exhibitions`} className="font-medium text-sm hover:text-primary">
                      {e.name}
                    </Link>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{e.organizerName}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {e.startDate ? new Date(e.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{e.exhibitors}</td>
                  <td className="p-3 text-sm text-muted-foreground">{e.visitors.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-sm font-semibold">{formatCurrency(e.revenue)}</td>
                  <td className="p-3">
                    <StatusBadge status={e.status} />
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
