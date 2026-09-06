import { Target, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Line, LineChart } from "recharts";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useLeadAnalytics } from "@/hooks/organizer/useLeadAnalytics";

const CHART_COLOR = "hsl(var(--primary))";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">{payload[0].value} leads</p>
    </div>
  );
}

export default function OrganizerLeadAnalytics() {
  const { data, isLoading, isError, refetch } = useLeadAnalytics();

  if (isLoading) return <LoadingState label="Loading lead analytics..." />;
  if (isError || !data) return <ErrorState description="Couldn't load lead analytics." onRetry={() => refetch()} />;

  const convertedCount = data.byStatus["converted"] ?? 0;
  const lostCount = data.byStatus["lost"] ?? 0;
  const byExhibitorChart = data.byExhibitor.slice(0, 8).map((e) => ({ name: e.name, count: e.count }));
  const byDayChart = data.byDay.map((d) => ({ date: new Date(d.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }), count: d.count }));

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-semibold">Lead Analytics</h1>
        <p className="text-muted-foreground">Aggregate lead performance across every exhibitor at your exhibitions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={data.totalLeads} icon={Target} />
        <StatCard title="Conversion Rate" value={`${Math.round(data.conversionRate * 100)}%`} icon={TrendingUp} />
        <StatCard title="Converted" value={convertedCount} icon={CheckCircle2} />
        <StatCard title="Lost" value={lostCount} icon={XCircle} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold mb-4">Leads by Exhibitor</h3>
          {byExhibitorChart.length === 0 ? (
            <EmptyState icon={Target} title="No leads captured yet" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byExhibitorChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Bar dataKey="count" fill={CHART_COLOR} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1.5 text-sm">
                {data.byExhibitor.slice(0, 5).map((e) => (
                  <div key={e.exhibitorBusinessId} className="flex justify-between text-muted-foreground">
                    <span className="truncate">{e.name}</span>
                    <span>
                      {e.count} lead{e.count === 1 ? "" : "s"} · {e.converted} converted
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-6">
          <h3 className="font-semibold mb-4">Leads by Day</h3>
          {byDayChart.length === 0 ? (
            <EmptyState icon={Target} title="No leads captured yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={byDayChart} margin={{ left: -16, right: 16 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Line type="monotone" dataKey="count" stroke={CHART_COLOR} strokeWidth={2} dot={{ r: 3, fill: CHART_COLOR }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="font-semibold mb-4">By Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {(["new", "contacted", "interested", "negotiation", "converted", "lost"] as const).map((status) => (
            <div key={status} className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold">{data.byStatus[status] ?? 0}</p>
              <p className="text-xs text-muted-foreground capitalize">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
