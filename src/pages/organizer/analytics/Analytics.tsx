import { useState, useEffect } from "react";
import { Users, QrCode, Store, Target, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Line, LineChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useExhibitions } from "@/hooks/exhibitor/useExhibitions";
import { useExhibitionAnalytics } from "@/hooks/organizer/useAnalytics";

const CHART_COLOR = "hsl(var(--primary))";
const SECONDARY_COLOR = "hsl(var(--muted-foreground))";

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-md px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name ?? "Count"}: {p.value}
        </p>
      ))}
    </div>
  );
}

function formatHour(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

export default function OrganizerAnalytics() {
  const { data: exhibitions = [], isLoading: exhibitionsLoading } = useExhibitions();
  const [exhibitionId, setExhibitionId] = useState<string>("");

  useEffect(() => {
    if (!exhibitionId && exhibitions.length > 0) {
      setExhibitionId(exhibitions.find((e) => e.status === "live")?.id ?? exhibitions[0].id);
    }
  }, [exhibitions, exhibitionId]);

  const { data, isLoading, isError, refetch } = useExhibitionAnalytics(exhibitionId);

  if (exhibitionsLoading) return <LoadingState label="Loading exhibitions..." />;

  if (exhibitions.length === 0) {
    return <EmptyState icon={TrendingUp} title="No exhibitions yet" description="Create an exhibition to see analytics here." />;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Exhibition Analytics</h1>
          <p className="text-muted-foreground">Visitor activity, sales, and exhibitor performance for one exhibition</p>
        </div>
        <Select value={exhibitionId} onValueChange={setExhibitionId}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select exhibition" />
          </SelectTrigger>
          <SelectContent>
            {exhibitions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading analytics..." />
      ) : isError || !data ? (
        <ErrorState description="Couldn't load analytics for this exhibition." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Exhibitors" value={data.exhibitorsCount} icon={Store} />
            <StatCard
              title="Stalls Occupied"
              value={`${data.stallOccupancy.sold + data.stallOccupancy.reserved} / ${data.stallOccupancy.total}`}
              icon={Store}
            />
            <StatCard title="Total Check-ins" value={data.checkInsOverTime.reduce((s, d) => s + d.count, 0)} icon={QrCode} />
            {data.leads ? (
              <StatCard title="Leads" value={data.leads.total} icon={Target} />
            ) : (
              <StatCard title="Leads" value="—" change="No permission" icon={Target} />
            )}
          </div>

          {/* Stall occupancy — a ratio, best read as a progress bar, not a chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Stall Occupancy</h3>
              <span className="text-sm text-muted-foreground">
                {data.stallOccupancy.sold} sold · {data.stallOccupancy.reserved} reserved · {data.stallOccupancy.available} available
              </span>
            </div>
            <Progress
              value={data.stallOccupancy.total > 0 ? ((data.stallOccupancy.sold + data.stallOccupancy.reserved) / data.stallOccupancy.total) * 100 : 0}
              className="h-2"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-1">Visitors vs Check-ins Over Time</h3>
              <p className="text-xs text-muted-foreground mb-4">Registrations vs. who actually showed up — the gap is your no-show rate</p>
              {data.visitorsOverTime.length === 0 ? (
                <EmptyState icon={Users} title="No visitor activity yet" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart margin={{ left: -16, right: 16 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="date"
                      allowDuplicatedCategory={false}
                      type="category"
                      tick={{ fontSize: 12 }}
                      stroke={SECONDARY_COLOR}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke={SECONDARY_COLOR} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line data={data.visitorsOverTime} type="monotone" dataKey="count" name="Visitors" stroke={CHART_COLOR} strokeWidth={2} dot={{ r: 3 }} />
                    <Line data={data.checkInsOverTime} type="monotone" dataKey="count" name="Check-ins" stroke={SECONDARY_COLOR} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-1">Peak Entry Periods</h3>
              <p className="text-xs text-muted-foreground mb-4">Busiest gate hours — plan staffing and queue management around these</p>
              {data.peakEntryPeriods.length === 0 ? (
                <EmptyState icon={QrCode} title="No check-ins yet" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.peakEntryPeriods.map((p) => ({ ...p, label: formatHour(p.hour) }))} margin={{ left: -16, right: 16 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke={SECONDARY_COLOR} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke={SECONDARY_COLOR} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                    <Bar dataKey="count" name="Check-ins" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Ticket Sales</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium">Ticket Type</th>
                    <th className="text-left p-4 text-sm font-medium">Sold / Capacity</th>
                    {data.revenue && <th className="text-left p-4 text-sm font-medium">Revenue</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.ticketSales.map((t) => (
                    <tr key={t.ticketTypeId}>
                      <td className="p-4 font-medium">{t.name}</td>
                      <td className="p-4 text-muted-foreground">
                        {t.sold} / {t.capacity}
                      </td>
                      {data.revenue && <td className="p-4">₹{t.revenue.toLocaleString("en-IN")}</td>}
                    </tr>
                  ))}
                  {data.ticketSales.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-muted-foreground">
                        No ticket types configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.revenue && (
              <div className="p-4 border-t border-border flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">Ticket Revenue: ₹{(data.revenue.ticket ?? 0).toLocaleString("en-IN")}</span>
                <span className="text-muted-foreground">Stall Revenue: ₹{(data.revenue.stall ?? 0).toLocaleString("en-IN")}</span>
                <span className="font-semibold">Total: ₹{data.revenue.total.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>

          {data.topExhibitors && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-1">Top Exhibitors by Leads</h3>
              <p className="text-xs text-muted-foreground mb-4">Who's generating the most visitor interest — worth highlighting or learning from</p>
              {data.topExhibitors.length === 0 ? (
                <EmptyState icon={Target} title="No leads captured yet" />
              ) : (
                <div className="space-y-2">
                  {data.topExhibitors.map((e, i) => (
                    <div key={e.exhibitionExhibitorId} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                      <span className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        {e.name}
                      </span>
                      <span className="text-sm text-muted-foreground">{e.leadCount} leads</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
