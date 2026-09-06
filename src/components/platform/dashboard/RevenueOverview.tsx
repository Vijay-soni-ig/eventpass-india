import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const CHART_COLOR = "hsl(var(--primary))";
const SECONDARY_COLOR = "hsl(var(--muted-foreground))";

interface RevenuePoint {
  date: string;
  revenue: number;
  transactions: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  mode: "revenue" | "transactions";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label ? new Date(label).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</p>
      <p className="text-muted-foreground">{mode === "revenue" ? formatCurrency(payload[0].value) : `${payload[0].value} transactions`}</p>
    </div>
  );
}

export function RevenueOverview({ data }: { data: RevenuePoint[] }) {
  const [mode, setMode] = useState<"revenue" | "transactions">("revenue");

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm">Revenue Overview</h3>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {(["revenue", "transactions"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-2.5 py-1 rounded transition-colors capitalize ${
                mode === m ? "bg-card shadow-sm font-medium" : "text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Paid transactions across every organizer, for the selected period</p>

      {data.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No revenue in this period" description="Once payments come in for this date range, they'll show up here." />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          {mode === "revenue" ? (
            <AreaChart data={data} margin={{ left: -16, right: 16 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLOR} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke={SECONDARY_COLOR}
                axisLine={false}
                tickLine={false}
                tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              />
              <YAxis tick={{ fontSize: 11 }} stroke={SECONDARY_COLOR} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} width={70} />
              <Tooltip content={<ChartTooltip mode="revenue" />} />
              <Area type="monotone" dataKey="revenue" stroke={CHART_COLOR} strokeWidth={2} fill="url(#revenueFill)" />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ left: -16, right: 16 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke={SECONDARY_COLOR}
                axisLine={false}
                tickLine={false}
                tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke={SECONDARY_COLOR} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip mode="transactions" />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="transactions" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
