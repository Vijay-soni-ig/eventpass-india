import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, CheckCircle2, Eye, EyeOff, GripVertical, Minus, Plus, RefreshCw, Settings2, TrendingUp, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { api } from "@/lib/apiClient";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEvents } from "@/hooks/useEvents";
import { hasOrganizerPermission, type Permission } from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";
import {
  useAddDashboardWidget,
  useCreateDashboard,
  useDashboardData,
  useDashboards,
  isDashboardOwnerId,
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
  const navigate = useNavigate();
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
  const creationAttemptedFor = useRef<string | null>(null);
  const [customize, setCustomize] = useState(false);
  const [eventId, setEventId] = useState("");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [recoveringWorkspace, setRecoveringWorkspace] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [selectedDashboardOwnerId, setSelectedDashboardOwnerId] = useState<string | null>(null);

  // If the client role context is stale, the API may return dashboards for
  // several authorized organizer memberships. Never silently pick one.
  const dashboardOwnerIds = useMemo(
    () => Array.from(new Set((dashboards ?? [])
      .filter((item) => item.ownerType === "ORGANIZER" && isDashboardOwnerId(item.ownerId ?? undefined))
      .map((item) => item.ownerId!))),
    [dashboards],
  );
  const requiresWorkspaceSelection = !isDashboardOwnerId(organizerId) && dashboardOwnerIds.length > 1;
  const dashboardsInSelectedWorkspace = requiresWorkspaceSelection
    ? selectedDashboardOwnerId
      ? dashboards?.filter((item) => item.ownerId === selectedDashboardOwnerId)
      : []
    : dashboards;
  const dashboard = dashboardsInSelectedWorkspace?.find((item) => item.isDefault) ?? dashboardsInSelectedWorkspace?.[0];
  const availableWidgets = useMemo(() => WIDGETS.filter((widget) => hasOrganizerPermission(user?.roles, widget.permission)), [user?.roles]);
  const activeWidgetTypes = new Set(dashboard?.widgets.filter((widget) => !widget.archivedAt).map((widget) => widget.widgetType) ?? []);
  const hiddenWidgets = dashboard?.widgets.filter((widget) => !widget.isVisible && !widget.archivedAt) ?? [];

  const filters = useMemo(() => ({ from: new Date(`${from}T00:00:00.000Z`).toISOString(), to: new Date(`${to}T23:59:59.999Z`).toISOString(), ...(eventId ? { eventId } : {}) }), [from, to, eventId]);
  const visibleWidgetsForFilter = dashboard?.widgets.filter((widget) => widget.isVisible && !widget.archivedAt) ?? [];
  const eventFilterAvailable = visibleWidgetsForFilter.length > 0 && visibleWidgetsForFilter.every((widget) => widget.widgetType !== "ORGANIZER_EVENT_KPI");
  const effectiveFilters = useMemo(() => ({ from: filters.from, to: filters.to, ...(eventFilterAvailable && eventId ? { eventId } : {}) }), [filters.from, filters.to, eventFilterAvailable, eventId]);
  const { data, isLoading: dataLoading, isError: dataError, refetch: refetchData } = useDashboardData(dashboard?.id, effectiveFilters);

  useEffect(() => {
    // Never create a dashboard while the lookup is pending or failed. A failed
    // lookup is not evidence that no dashboard exists; treating it as empty
    // caused repeated POSTs and exhausted the dashboard mutation rate limit.
    if (
      isLoading ||
      isError ||
      !canManage ||
      !isDashboardOwnerId(organizerId) ||
      dashboard ||
      createDashboard.isPending ||
      createDashboard.isError ||
      creationAttemptedFor.current === organizerId
    ) return;

    const widgets = availableWidgets.slice(0, 5).map((widget, index) => ({
      widgetType: widget.id,
      x: (index % 4) * 3,
      y: Math.floor(index / 4) * 3,
      width: widget.width,
      height: widget.height,
    }));
    if (!widgets.length) return;

    creationAttemptedFor.current = organizerId;
    createDashboard.mutate({
      ownerType: "ORGANIZER",
      ownerId: organizerId,
      name: "Organizer Dashboard",
      isDefault: true,
      widgets,
    });
  }, [isLoading, isError, dashboard, canManage, organizerId, availableWidgets, createDashboard]);

  if (!canView) return <EmptyState icon={BarChart3} title="Dashboard unavailable" description="Your current role does not have dashboard access." />;
  if (isLoading) return <LoadingState label="Loading your dashboard..." />;
  if (isError) return <ErrorState title="Couldn't load dashboard" description="The dashboard request failed. Check your connection and try again." onRetry={() => refetch()} />;
  // When the client owner ID is stale and more than one authorized organizer
  // has dashboards, require an explicit workspace choice instead of displaying
  // whichever default/recent dashboard happens to sort first.
  if (requiresWorkspaceSelection && !selectedDashboardOwnerId) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Users className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Choose an organizer workspace</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Your account can access more than one organizer workspace, but its current workspace context is out of date. Choose the workspace you want to open.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          {dashboardOwnerIds.map((ownerId, index) => {
            const membership = user?.roles.organizer.find((item) => item.organizerId === ownerId);
            const ownerDashboard = (dashboards ?? []).find((item) => item.ownerId === ownerId && item.isDefault)
              ?? (dashboards ?? []).find((item) => item.ownerId === ownerId);
            const label = membership?.name || ownerDashboard?.name || ("Organizer workspace " + (index + 1));
            return (
              <Button key={ownerId} variant="outline" className="justify-start" onClick={() => setSelectedDashboardOwnerId(ownerId)}>
                {label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }
  // Existing dashboards can still be resolved by the server's authenticated
  // owner scope when the client role context is stale. A valid UUID is only
  // required when creating a new dashboard.
  if (!isDashboardOwnerId(organizerId) && !dashboard) {
    const isPlatformAdmin = Boolean(user?.roles.platformAdmin);
    const canRecoverWorkspace = user?.userType === "organizer" && !isPlatformAdmin;

    const recoverWorkspace = async () => {
      if (recoveringWorkspace) return;
      setRecoveringWorkspace(true);
      setRecoveryError(null);
      try {
        await api.post("/api/auth/organizer-workspace/recover");
        // AuthContext resolves membership from /api/auth/me on page load.
        window.location.reload();
      } catch (error) {
        setRecoveryError(error instanceof Error ? error.message : "Workspace recovery failed. Please try again.");
      } finally {
        setRecoveringWorkspace(false);
      }
    };

    return (
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-sm sm:px-10">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          {isPlatformAdmin ? "Choose an organizer workspace" : "Your organizer workspace needs attention"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {isPlatformAdmin
            ? "Platform administrator accounts do not have one default organizer workspace. Open Platform Admin and select the organizer you want to manage."
            : "We couldn't find an active organizer workspace linked to this account. You can safely check whether this account needs initial workspace setup. Existing memberships and invitations will not be replaced."}
        </p>
        {recoveryError && (
          <p role="alert" className="mt-4 max-w-md rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {recoveryError}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {isPlatformAdmin ? (
            <Button onClick={() => navigate("/platform")}>Open Platform Admin</Button>
          ) : canRecoverWorkspace ? (
            <Button onClick={() => void recoverWorkspace()} disabled={recoveringWorkspace}>
              {recoveringWorkspace ? "Checking workspace…" : "Restore workspace access"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => window.location.reload()}>Refresh account</Button>
          )}
          {canRecoverWorkspace && (
            <Button variant="outline" onClick={() => window.location.reload()} disabled={recoveringWorkspace}>
              Refresh account
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (createDashboard.isError) {
    const message = createDashboard.error instanceof Error ? createDashboard.error.message : "The dashboard could not be created.";
    return <ErrorState title="Couldn't create dashboard" description={message} onRetry={() => {
      creationAttemptedFor.current = null;
      createDashboard.reset();
      void refetch();
    }} />;
  }
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
    if (resetting || updateWidget.isPending) return;
    setResetting(true);
    try {
      let current = dashboard;
      for (const widget of current.widgets.filter((item) => !item.archivedAt)) {
        const definition = definitionFor(widget.widgetType);
        if (!definition) continue;
        await updateWidget.mutateAsync({
          dashboardId: current.id,
          widgetId: widget.id,
          version: current.version,
          x: 0,
          y: 0,
          width: definition.width,
          height: definition.height,
          isVisible: true,
        });
        const refreshed = await refetch();
        const latest = refreshed.data?.find((item) => item.id === current.id);
        if (!latest) throw new Error("Dashboard could not be refreshed after resetting a widget");
        current = latest;
      }
      toast.success("Dashboard layout reset");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reset dashboard layout. Please try again.");
      await refetch();
    } finally {
      setResetting(false);
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
            <SelectTrigger className="w-52" disabled={!eventFilterAvailable}><SelectValue placeholder={eventFilterAvailable ? "All events" : "Event filter not applicable"} /></SelectTrigger>
            <SelectContent><SelectItem value="all">All events</SelectItem>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}</SelectContent>
          </Select>
          {requiresWorkspaceSelection && selectedDashboardOwnerId && (
            <Button variant="outline" onClick={() => setSelectedDashboardOwnerId(null)}>Switch workspace</Button>
          )}
          {canManage && <Button variant={customize ? "default" : "outline"} onClick={() => setCustomize((value) => !value)}><Settings2 className="mr-2 h-4 w-4" />{customize ? "Done" : "Customize"}</Button>}
          <Button variant="ghost" size="icon" onClick={() => refetchData()} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {customize && (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Customize dashboard</span>
            <Button size="sm" variant="outline" onClick={() => setAdding((value) => !value)}><Plus className="mr-2 h-4 w-4" />Add widget</Button>
            <Button size="sm" variant="ghost" onClick={() => reset()} disabled={resetting || updateWidget.isPending}>{resetting ? "Resetting…" : "Reset layout"}</Button>
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
