import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--muted-foreground))"];

interface ActivityBreakdown {
  newOrganizers: number;
  newExhibitions: number;
  newExhibitors: number;
  newVisitors: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; value: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { label, value } = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{value.toLocaleString("en-IN")} new</p>
    </div>
  );
}

export function PlatformActivity({ data }: { data: ActivityBreakdown }) {
  const rows = [
    { label: "New Organizers", value: data.newOrganizers },
    { label: "New Exhibitions", value: data.newExhibitions },
    { label: "New Exhibitors", value: data.newExhibitors },
    { label: "New Visitors", value: data.newVisitors },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full">
      <h3 className="font-semibold text-sm mb-1">Platform Activity</h3>
      <p className="text-xs text-muted-foreground mb-4">New signups and listings created within the selected period</p>

      {total === 0 ? (
        <EmptyState icon={Activity} title="No new activity in this period" />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
