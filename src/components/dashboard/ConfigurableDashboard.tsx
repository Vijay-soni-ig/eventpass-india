import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Eye, EyeOff, GripVertical, Minus, Plus, RefreshCw, Settings2, TrendingUp, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/apiClient";
import { useEvents } from "@/hooks/useEvents";
import { hasOrganizerPermission, type Permission } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import {
  useAddDashboardWidget,
  useCreateDashboard,
  useDashboardData,
  useDashboards,
  useDeleteDashboardWidget,
  useUpdateDashboardWidget,
  type DashboardWidget,
} from "@/hooks/useDashboards";

const WIDGETS = [
  { id: "ORGANIZER_EVENT_KPI", label: "Events", description: "Total events in the selected period.", permission: "event:view" as Permission, icon: BarChart3, width: 3, height: 2 },
  { id: "ORGANIZER_REVENUE_KPI", label: "Gross revenue", description: "Ticket plus stall gross revenue.", permission: "payment:view" as Permission, icon: Wallet, width: 3, height: 2 },
  { id: "ORGANIZER_ATTENDANCE_KPI", label: "Attendance rate", description: "Issued tickets that checked in.", permission: "registration:view" as Permission, icon: CheckCircle2, width: 3, height: 2 },
  { id: "ORGANIZER_STALL_OCCUPANCY", label: "Stall occupancy", description: "Reserved and sold stalls.", permission: "stall:manage" as Permission, icon: BarChart3, width: 4, height: 3 },
  { id: "ORGANIZER_LEAD_CONVERSION", label: "Lead conversion", description: "Converted versus lost leads.", permission: "lead:analytics" as Permission, icon: TrendingUp, width: 4, height: 3 },
  { id: "EVENT_REGISTRATION_KPI", label: "Event registrations", description: "Registrations for a selected event.", permission: "event:view" as Permission, icon: Users, width: 3, height: 2 },
  { id: "EVENT_TICKET_REVENUE_KPI", label: "Net ticket revenue", description: "Paid ticket revenue after refunds.", permission: "payment:view" as Permission, icon: Wallet, width: 3, height: 2 },
  { id: "EVENT_CHECKIN_RATE", label: "Event check-in rate", description: "Check-in rate for a selected event.", permission: "event:view" as Permission, icon: CheckCircle2, width: 4, height: 3 },
  { id: "EVENT_TICKET_REVENUE_TREND", label: "Ticket revenue trend", description: "Daily gross, refunds and net revenue.", permission: "payment:view" as Permission, icon: TrendingUp, width: 6, height: 4 },
  { id: "EVENT_REGISTRATION_TREND", label: "Registration trend", description: "Daily total and confirmed registrations.", permission: "event:view" as Permission, icon: TrendingUp, width: 6, height: 4 },
] as const;

const iconFor = (widgetType: string) => WIDGETS.find((item) => item.id === widgetType)?.icon ?? BarChart3;
const definitionFor = (widgetType: string) => WIDGETS.find((item) => item.id === widgetType);

function formatValue(value: number, unit: "COUNT" | "PERCENT" | "CURRENCY") {
  if (unit === "PERCENT") return `${value}%`;
  if (unit === "CURRENCY") return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return value.toLocaleString("en-IN");
}

function WidgetCard({
  widget,
  data,
  customize,
  version,
  onMove,
  onResize,
  onVisibility,
  onRemove,
}: {
  widget: DashboardWidget;
  data: ReturnType<typeof useDashboardData>["data"];
  customize: boolean;
  version: number;
  onMove: (widget: DashboardWidget, dx: number, dy: number) => void;
  onResize: (widget: DashboardWidget, delta: number) => void;
  onVisibility: (widget: DashboardWidget) => void;
  onRemove: (widget: DashboardWidget) => void;
}) {
  const definition = definitionFor(widget.widgetType);
  const resolved = data?.widgets.find((item) => item.widgetId === widget.widgetType);
  const Icon = iconFor(widget.widgetType);

  return (
    <article
      className="group relative min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
      style={{ gridColumn: `span ${Math.min(widget.width, 12)}`, minHeight: `${Math.max(widget.height * 58, 140)}px` }}
      aria-label={definition?.label ?? widget.widgetType}
    >
      {customize && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm">
          <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Move left" onClick={() => onMove(widget, -1, 0)}><span aria-hidden="true">←</span><span className="sr-only">Move left</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Move right" onClick={() => onMove(widget, 1, 0)}><span aria-hidden="true">→</span><span className="sr-only">Move right</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Move down" onClick={() => onMove(widget, 0, 1)}><span aria-hidden="true">↓</span><span className="sr-only">Move down</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Narrow" onClick={() => onResize(widget, -1)}><Minus className="h-3 w-3" /><span className="sr-only">Make narrower</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Widen" onClick={() => onResize(widget, 1)}><Plus className="h-3 w-3" /><span className="sr-only">Make wider</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Hide widget" onClick={() => onVisibility(widget)}><EyeOff className="h-3 w-3" /><span className="sr-only">Hide widget</span></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove widget" onClick={() => onRemove(widget)}><X className="h-3 w-3" /><span className="sr-only">Remove widget</span></Button>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></div>
            <div>
              <h3 className="text-sm font-semibold">{definition?.label ?? widget.widgetType}</h3>
              <p className="text-xs text-muted-foreground">{definition?.description}</p>
            </div>
          </div>
        </div>
      </div>
      {!data ? <div className="mt-6 h-10 animate-pulse rounded-md bg-muted" /> : resolved?.status === "NO_DATA" ? (
        <div className="mt-6 text-sm text-muted-foreground">No data for the selected filters.</div>
      ) : resolved?.series ? (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Trend</span><span>{resolved.series.length} days</span></div>
          <div className="flex h-20 items-end gap-1 overflow-hidden rounded-md bg-muted/40 p-2" aria-label={`${definition?.label} trend`}>
            {resolved.series.slice(-30).map((point) => {
              const value = point.values.net ?? point.values.total ?? point.values.confirmed ?? point.values.gross ?? 0;
              const max = Math.max(...resolved.series.map((item) => item.values.net ?? item.values.total ?? item.values.confirmed ?? item.values.gross ?? 0), 1);
              return <div key={point.date} title={`${point.date}: ${value}`} className="min-w-1 flex-1 rounded-t bg-primary/60" style={{ height: `${Math.max(4, (value / max) * 100)}%` }} />;
            })}
          </div>
        </div>
      ) : resolved?.metrics && Object.keys(resolved.metrics).length ? (
        <div className="mt-6">
          <div className="text-3xl font-semibold tracking-tight">{formatValue(Object.values(resolved.metrics)[0].value, Object.values(resolved.metrics)[0].unit)}</div>
          {Object.values(resolved.metrics)[0].numerator !== undefined && Object.values(resolved.metrics)[0].denominator !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">{Object.values(resolved.metrics)[0].numerator} / {Object.values(resolved.metrics)[0].denominator}</p>
          )}
        </div>
      ) : (
        <div className="mt-6 text-sm text-muted-foreground">This widget has no current metric data.</div>
      )}
      {customize && <div className="mt-4 text-[11px] text-muted-foreground">v{version} · drag controls are available above</div>}
    </article>
  );
}

export function ConfigurableDashboard() {
  const { user } = useAuth();
  const organizerId = user?.roles.organizer[0]?.organizerId;
  const canManage = hasOrganizerPermission(user?.roles, "dashboard:manage");
  const canView = hasOrganizerPermission(user?.roles, "dashboard:view");
  const { data: eventsData } = useEvents({ page: 1, limit: 100, archived: false });
  const events = eventsData?.events ?? [];
  const { data: dashboards, isLoading, isError, refetch } = useDashboards("ORGANIZER", organizerId);
  const createDashboard = useCreateDashboard();
  const addWidget = useAddDashboardWidget();
  const updateWidget = useUpdateDashboardWidget();
  const deleteWidget = useDeleteDashboardWidget();
  const [customize, setCustomize] = useState(false);
  const [eventId, setEventId] = useState("");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);

  const dashboard = dashboards?.find((item) => item.isDefault) ?? dashboards?.[0];
  const availableWidgets = useMemo(() => WIDGETS.filter((widget) => hasOrganizerPermission(user?.roles, widget.permission)), [user?.roles]);
  const activeWidgetTypes = new Set(dashboard?.widgets.filter((widget) => !widget.archivedAt).map((widget) => widget.widgetType) ?? []);
  const hiddenWidgets = dashboard?.widgets.filter((widget) => !widget.isVisible && !widget.archivedAt) ?? [];

  const filters = useMemo(() => ({ from: new Date(`${from}T00:00:00.000Z`).toISOString(), to: new Date(`${to}T23:59:59.999Z`).toISOString(), ...(eventId ? { eventId } : {}) }), [from, to, eventId]);
  const { data, isLoading: dataLoading, isError: dataError, refetch: refetchData } = useDashboardData(dashboard?.id, filters);

  useEffect(() => {
    if (!dashboard && canManage && organizerId && !createDashboard.isPending) {
      const widgets = availableWidgets.slice(0, 5).map((widget, index) => ({ widgetType: widget.id, x: (index % 4) * 3, y: Math.floor(index / 4) * 3, width: widget.width, height: widget.height }));
      if (widgets.length) createDashboard.mutate({ ownerType: "ORGANIZER", ownerId: organizerId, name: "Organizer Dashboard", isDefault: true, widgets });
    }
  }, [dashboard, canManage, organizerId, availableWidgets, createDashboard]);

  if (!canView) return <EmptyState icon={BarChart3} title="Dashboard unavailable" description="Your current role does not have dashboard access." />;
  if (isLoading) return <LoadingState label="Loading your dashboard..." />;
  if (isError) return <ErrorState title="Couldn't load dashboard" description="Please try again." onRetry={() => refetch()} />;
  if (!dashboard) return <EmptyState icon={Settings2} title="No dashboard configured" description="A dashboard administrator can create a dashboard for this workspace." />;

  const visibleWidgets = dashboard.widgets.filter((widget) => widget.isVisible && !widget.archivedAt);

  const moveWidget = (widget: DashboardWidget, dx: number, dy: number) => {
    const x = Math.max(0, Math.min(12 - widget.width, widget.x + dx));
    const y = Math.max(0, widget.y + dy);
    updateWidget.mutate({ dashboardId: dashboard.id, widgetId: widget.id, version: dashboard.version, x, y, width: widget.width, height: widget.height, isVisible: widget.isVisible });
  };

  const resizeWidget = (widget: DashboardWidget, delta: number) => {
    const definition = definitionFor(widget.widgetType);
    const minWidth = definition?.width === 6 ? 4 : definition?.width === 4 ? 3 : 2;
    const width = Math.max(minWidth, Math.min(12, widget.width + delta));
    updateWidget.mutate({ dashboardId: dashboard.id, widgetId: widget.id, version: dashboard.version, width, height: widget.height, x: widget.x, y: widget.y, isVisible: widget.isVisible });
  };

  const toggleVisibility = (widget: DashboardWidget) => {
    updateWidget.mutate({ dashboardId: dashboard.id, widgetId: widget.id, version: dashboard.version, isVisible: !widget.isVisible });
  };

  const removeWidget = (widget: DashboardWidget) => {
    deleteWidget.mutate({ dashboardId: dashboard.id, widgetId: widget.id, version: dashboard.version });
  };

  const reset = async () => {
    for (const widget of dashboard.widgets.filter((item) => !item.archivedAt)) {
      const definition = definitionFor(widget.widgetType);
      if (!definition) continue;
      await updateWidget.mutateAsync({ dashboardId: dashboard.id, widgetId: widget.id, version: dashboard.version, x: 0, y: 0, width: definition.width, height: definition.height, isVisible: true });
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{dashboard.name}</h2>
          <p className="text-xs text-muted-foreground">Live data · refreshed every minute · last generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("en-IN") : "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="dashboard-from" className="text-xs text-muted-foreground">From</label>
            <input id="dashboard-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            <label htmlFor="dashboard-to" className="text-xs text-muted-foreground">To</label>
            <input id="dashboard-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <Select value={eventId || "all"} onValueChange={(value) => setEventId(value === "all" ? "" : value)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="All events" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All events</SelectItem>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}</SelectContent>
          </Select>
          {canManage && <Button variant={customize ? "default" : "outline"} onClick={() => setCustomize((value) => !value)}><Settings2 className="mr-2 h-4 w-4" />{customize ? "Done" : "Customize"}</Button>}
          <Button variant="ghost" size="icon" onClick={() => refetchData()} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {customize && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Customize dashboard</span>
            <Button size="sm" variant="outline" onClick={() => setAdding((value) => !value)}><Plus className="mr-2 h-4 w-4" />Add widget</Button>
            <Button size="sm" variant="ghost" onClick={() => reset()}>Reset layout</Button>
            {hiddenWidgets.map((widget) => <Button key={widget.id} size="sm" variant="ghost" onClick={() => toggleVisibility(widget)}><Eye className="mr-1 h-3 w-3" />{definitionFor(widget.widgetType)?.label ?? widget.widgetType}</Button>)}
          </div>
          {adding && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableWidgets.filter((widget) => !activeWidgetTypes.has(widget.id)).map((widget) => (
                <button key={widget.id} type="button" className="rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50" onClick={() => {
                  const y = dashboard.widgets.reduce((max, item) => Math.max(max, item.y + item.height), 0);
                  addWidget.mutate({ dashboardId: dashboard.id, widgetType: widget.id, x: 0, y, width: widget.width, height: widget.height, isVisible: true });
                  setAdding(false);
                }}>
                  <div className="text-sm font-medium">{widget.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{widget.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {dataLoading ? <LoadingState label="Loading dashboard data..." /> : dataError ? (
        <ErrorState title="Dashboard data unavailable" description="The dashboard configuration loaded, but its metrics could not be resolved." onRetry={() => refetchData()} />
      ) : visibleWidgets.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12" aria-live="polite">
          {visibleWidgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} data={data} customize={customize} version={dashboard.version} onMove={moveWidget} onResize={resizeWidget} onVisibility={toggleVisibility} onRemove={removeWidget} />
          ))}
        </div>
      ) : (
        <EmptyState icon={BarChart3} title="No visible widgets" description="Customize the dashboard and add the metrics your team needs." />
      )}
    </section>
  );
}
