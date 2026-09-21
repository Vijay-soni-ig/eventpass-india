import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Settings2, UserRoundCheck, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/apiClient";
import { useEvents } from "@/hooks/useEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";

type Registration = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  registeredAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

type Settings = {
  eventId: string;
  enabled: boolean;
  capacity: number | null;
  requiresApproval: boolean;
};

type Analytics = {
  totals: { total: number; pending: number; confirmed: number; cancelled: number };
  capacity: { configured: number | null; utilization: number | null };
  approvalRate: number;
  trend: Array<{ date: string; registrations: number }>;
};

const statusBadge = (status: Registration["status"]) =>
  status === "CONFIRMED" ? "verified" : status === "PENDING" ? "pending" : "suspended";

export default function OrganizerRegistrations() {
  const [params, setParams] = useSearchParams();
  const { data: eventsData, isLoading: eventsLoading } = useEvents({ page: 1, limit: 100 });
  const events = eventsData?.events ?? [];
  const eventId = params.get("eventId") || events[0]?.id || "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ registrations: Registration[]; total: number; pageSize: number } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState(false);

  const selectedEvent = useMemo(() => events.find((event) => event.id === eventId), [events, eventId]);

  useEffect(() => {
    if (events.length && !params.get("eventId")) {
      setParams((current) => { current.set("eventId", events[0].id); return current; }, { replace: true });
    }
  }, [events, params, setParams]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const query = new URLSearchParams({ eventId, page: String(page), limit: "20" });
    if (status !== "ALL") query.set("status", status);
    if (search.trim()) query.set("search", search.trim());
    api.get<{ registrations: Registration[]; total: number; page: number; pageSize: number }>(`/api/organizer/registrations?${query}`)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, page, search, status]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setSettingsLoading(true);
    api.get<{ settings: Settings }>(`/api/organizer/registrations/settings/${eventId}`)
      .then((result) => { if (!cancelled) setSettings(result.settings); })
      .catch(() => { if (!cancelled) setSettings(null); })
      .finally(() => { if (!cancelled) setSettingsLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    api.get<Analytics>(`/api/organizer/registrations/analytics/${eventId}`)
      .then((result) => { if (!cancelled) setAnalytics(result); })
      .catch(() => { if (!cancelled) setAnalytics(null); })
      .finally(() => { if (!cancelled) setAnalyticsLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  const updateStatus = async (id: string, next: "CONFIRMED" | "CANCELLED") => {
    try {
      await api.patch<{ registration: Registration }>(`/api/organizer/registrations/${id}/status`, {
        status: next,
        ...(next === "CANCELLED" ? { cancellationReason: "Cancelled by organizer" } : {}),
      });
      toast.success(next === "CONFIRMED" ? "Registration confirmed" : "Registration cancelled");
      setData((current) => current ? {
        ...current,
        registrations: current.registrations.map((item) => item.id === id ? { ...item, status: next, confirmedAt: next === "CONFIRMED" ? new Date().toISOString() : item.confirmedAt, cancelledAt: next === "CANCELLED" ? new Date().toISOString() : null } : item),
      } : current);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to update registration");
    }
  };

  if (eventsLoading) return <LoadingState label="Loading events..." />;
  if (!events.length) return <EmptyState icon={UserRoundCheck} title="No events yet" description="Create an event before managing registrations." />;
  if (error) return <ErrorState title="Couldn't load registrations" description="Please try again." onRetry={() => setPage((value) => value)} />;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Registrations</h1>
          <p className="text-muted-foreground">Manage visitor registrations, approvals, capacity and cancellations.</p>
        </div>
        <Select value={eventId} onValueChange={(value) => { setParams({ eventId: value }); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-80"><SelectValue placeholder="Select event" /></SelectTrigger>
          <SelectContent>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{data?.total ?? 0}</p><p className="text-sm text-muted-foreground">Matching registrations</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{settings?.capacity ?? "∞"}</p><p className="text-sm text-muted-foreground">Capacity</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{settings?.requiresApproval ? "Manual" : "Automatic"}</p><p className="text-sm text-muted-foreground">Approval mode</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{settings?.enabled === false ? "Off" : "On"}</p><p className="text-sm text-muted-foreground">Registration</p></div>
      </div>

      <div className="rounded-xl border bg-card p-4 flex flex-col gap-3 md:flex-row">
        <Input className="md:max-w-md" placeholder="Search name, email or company..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingState label="Loading registrations..." /> : !data?.registrations.length ? (
        <EmptyState icon={UserRoundCheck} title="No registrations found" description={search || status !== "ALL" ? "Try changing your filters." : `No registrations have been submitted for ${selectedEvent?.title ?? "this event"} yet.`} />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50"><tr>
                <th className="text-left p-4 text-sm font-medium">Visitor</th>
                <th className="text-left p-4 text-sm font-medium">Company</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Registered</th>
                <th className="text-right p-4 text-sm font-medium">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td className="p-4"><p className="font-medium">{registration.fullName}</p><p className="text-sm text-muted-foreground">{registration.email}{registration.phone ? ` · ${registration.phone}` : ""}</p></td>
                    <td className="p-4 text-muted-foreground">{registration.companyName || "—"}</td>
                    <td className="p-4"><StatusBadge status={statusBadge(registration.status)} /></td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(registration.registeredAt).toLocaleString()}</td>
                    <td className="p-4"><div className="flex justify-end gap-2">
                      {registration.status === "PENDING" && <Button size="sm" onClick={() => updateStatus(registration.id, "CONFIRMED")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Approve</Button>}
                      {registration.status !== "CANCELLED" && <Button size="sm" variant="outline" onClick={() => updateStatus(registration.id, "CANCELLED")}><XCircle className="mr-1.5 h-4 w-4" />Cancel</Button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t p-4">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /><h2 className="font-semibold">Registration analytics</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Event-scoped registration performance for the selected event.</p>
        {analyticsLoading ? <div className="mt-4"><LoadingState label="Loading analytics..." /></div> : analytics ? (
          <>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="rounded-lg border p-3"><p className="text-xl font-bold">{analytics.totals.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
              <div className="rounded-lg border p-3"><p className="text-xl font-bold">{analytics.totals.pending}</p><p className="text-xs text-muted-foreground">Pending</p></div>
              <div className="rounded-lg border p-3"><p className="text-xl font-bold">{analytics.totals.confirmed}</p><p className="text-xs text-muted-foreground">Confirmed</p></div>
              <div className="rounded-lg border p-3"><p className="text-xl font-bold">{analytics.totals.cancelled}</p><p className="text-xs text-muted-foreground">Cancelled</p></div>
              <div className="rounded-lg border p-3"><p className="text-xl font-bold">{analytics.approvalRate}%</p><p className="text-xs text-muted-foreground">Confirmation rate</p></div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Capacity utilization</span>
                <span className="text-muted-foreground">{analytics.capacity.utilization === null ? "Unlimited" : `${analytics.capacity.utilization}% of ${analytics.capacity.configured}`}</span>
              </div>
              {analytics.capacity.utilization !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, analytics.capacity.utilization)}%` }} /></div>}
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium">Registrations — last 30 days</p>
              <div className="mt-3 grid grid-cols-10 gap-1 items-end h-24">
                {analytics.trend.map((point) => {
                  const max = Math.max(1, ...analytics.trend.map((item) => item.registrations));
                  return <div key={point.date} title={`${point.date}: ${point.registrations}`} className="flex h-full flex-col justify-end"><div className="rounded-t bg-primary/70" style={{ height: `${Math.max(4, (point.registrations / max) * 100)}%` }} /></div>;
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{analytics.trend[0]?.date}</span><span>{analytics.trend.at(-1)?.date}</span></div>
            </div>
          </>
        ) : <p className="mt-4 text-sm text-muted-foreground">Analytics are unavailable for this event.</p>}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2"><Settings2 className="h-5 w-5" /><h2 className="font-semibold">Registration settings</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Current settings are read-only here until the lifecycle policy is finalized.</p>
        {settingsLoading ? <LoadingState label="Loading settings..." /> : settings && <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground">Enabled:</span> {settings.enabled ? "Yes" : "No"}</div>
          <div><span className="text-muted-foreground">Capacity:</span> {settings.capacity ?? "Unlimited"}</div>
          <div><span className="text-muted-foreground">Approval:</span> {settings.requiresApproval ? "Required" : "Automatic"}</div>
        </div>}
      </div>
    </div>
  );
}
