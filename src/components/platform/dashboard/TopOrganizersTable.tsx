import { Link } from "react-router-dom";
import { ArrowRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, cn } from "@/lib/utils";
import type { PlatformTopOrganizer } from "@/hooks/platform/usePlatformAdmin";

export function TopOrganizersTable({ organizers }: { organizers: PlatformTopOrganizer[] }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Top Organizers</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by revenue in the selected period</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
          <Link to="/platform/organizers">
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>

      {organizers.length === 0 ? (
        <EmptyState icon={Landmark} title="No organizer revenue in this period" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground w-10">#</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitions</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Exhibitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Visitors</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Revenue</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizers.map((o, i) => (
                <tr key={o.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                        i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link to={`/platform/organizers/${o.id}`} className="font-medium text-sm hover:text-primary">
                      {o.name}
                    </Link>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{o.exhibitions}</td>
                  <td className="p-3 text-sm text-muted-foreground">{o.exhibitors}</td>
                  <td className="p-3 text-sm text-muted-foreground">{o.visitors.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-sm font-semibold">{formatCurrency(o.revenue)}</td>
                  <td className="p-3">
                    <StatusBadge status={o.suspended ? "suspended" : "active"} />
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
