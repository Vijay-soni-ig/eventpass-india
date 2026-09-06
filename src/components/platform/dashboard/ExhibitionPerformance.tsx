import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_COLORS: Record<string, string> = {
  live: "hsl(var(--success))",
  draft: "hsl(var(--muted-foreground))",
  paused: "hsl(var(--warning))",
  completed: "hsl(var(--primary))",
};

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  draft: "Draft",
  paused: "Paused",
  completed: "Completed",
};

interface StatusRow {
  status: string;
  count: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: StatusRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{STATUS_LABELS[row.status] ?? row.status}</p>
      <p className="text-muted-foreground">{row.count} exhibitions</p>
    </div>
  );
}

export function ExhibitionPerformance({ breakdown }: { breakdown: StatusRow[] }) {
  const total = breakdown.reduce((s, r) => s + r.count, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Exhibition Performance</h3>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
          <Link to="/platform/exhibitions">
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Current status across every exhibition on the platform</p>

      {total === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No exhibitions have been created yet"
          description="Once organizers publish exhibitions, performance data will appear here."
        />
      ) : (
        <div className="flex items-center gap-6">
          <div className="w-40 h-40 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown} dataKey="count" nameKey="status" innerRadius={45} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                  {breakdown.map((row) => (
                    <Cell key={row.status} fill={STATUS_COLORS[row.status] ?? "hsl(var(--muted-foreground))"} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2.5">
            {breakdown.map((row) => (
              <Link
                key={row.status}
                to="/platform/exhibitions"
                className="flex items-center justify-between text-sm hover:text-primary transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[row.status] }} />
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
                <span className="font-medium tabular-nums">{row.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
