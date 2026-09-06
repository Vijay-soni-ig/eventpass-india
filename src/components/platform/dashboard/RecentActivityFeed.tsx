import { Link } from "react-router-dom";
import { ArrowRight, Activity as ActivityIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatActionLabel } from "@/lib/utils";
import type { PlatformDashboardMetrics } from "@/hooks/platform/usePlatformAdmin";

type ActivityEntry = PlatformDashboardMetrics["recentActivity"][number];

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function groupLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function describe(entry: ActivityEntry): { title: string; context: string } {
  const context = [entry.entityType, entry.entityId ? entry.entityId.slice(0, 8) : null, entry.actorEmail ? `by ${entry.actorEmail}` : null]
    .filter(Boolean)
    .join(" · ");
  return { title: formatActionLabel(entry.action), context };
}

export function RecentActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const groups = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const label = groupLabel(entry.createdAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-sm">Recent Activity</h3>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
          <Link to="/platform/audit-logs">
            View audit logs <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity recorded yet" />
      ) : (
        <div>
          {Array.from(groups.entries()).map(([label, items]) => (
            <div key={label}>
              <div className="px-4 py-1.5 bg-secondary/40 text-xs font-medium text-muted-foreground">{label}</div>
              <div className="divide-y divide-border">
                {items.map((entry) => {
                  const { title, context } = describe(entry);
                  return (
                    <div key={entry.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-secondary/30 transition-colors">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{title}</p>
                        <p className="text-xs text-muted-foreground truncate">{context}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{relativeTime(entry.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
