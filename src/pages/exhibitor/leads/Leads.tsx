import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, Download, Plus, Target, Mail, Phone, Calendar, Users, Clock, TrendingUp, QrCode } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  useLeads,
  useCaptureLead,
  useExhibitorLeadAnalytics,
  exportLeads,
  type LeadFilters,
  type LeadStatus,
  type LeadPriority,
} from "@/hooks/exhibitor/useLeads";
import { useParticipations } from "@/hooks/exhibitor/useParticipations";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission, hasExhibitorPermissionForBusiness } from "@/lib/permissions";
import { useEventLeads, useEventLeadAnalytics, useEventLeadFollowUps, useUpdateEventLeadFollowUp, exportEventLeads } from "@/hooks/exhibitor/useEventLeads";

const statusOptions: LeadStatus[] = ["new", "contacted", "interested", "negotiation", "converted", "lost"];
const priorityOptions: LeadPriority[] = ["low", "medium", "high"];

function AddLeadDialog({ onClose }: { onClose: () => void }) {
  const { data: participations = [] } = useParticipations();
  const confirmed = participations.filter((p) => p.status === "confirmed");
  const captureLead = useCaptureLead();

  const [exhibitionExhibitorId, setExhibitionExhibitorId] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!exhibitionExhibitorId) {
      toast.error("Select which exhibition this lead is for");
      return;
    }
    if (!visitorName && !visitorEmail && !visitorPhone) {
      toast.error("Enter at least one contact detail");
      return;
    }
    captureLead.mutate(
      {
        exhibitionExhibitorId,
        visitorName: visitorName || undefined,
        visitorEmail: visitorEmail || undefined,
        visitorPhone: visitorPhone || undefined,
        notes: notes || undefined,
        source: "manual",
      },
      {
        onSuccess: () => {
          toast.success("Lead added");
          onClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to add lead"),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Exhibition</Label>
            <Select value={exhibitionExhibitorId} onValueChange={setExhibitionExhibitorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select exhibition" />
              </SelectTrigger>
              <SelectContent>
                {confirmed.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.exhibition?.name ?? "Exhibition"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {confirmed.length === 0 && (
              <p className="text-xs text-muted-foreground">
                You need a confirmed participation before capturing leads.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Visitor name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={visitorPhone} onChange={(e) => setVisitorPhone(e.target.value)} placeholder="Phone" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={visitorEmail} onChange={(e) => setVisitorEmail(e.target.value)} placeholder="Email" />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did they ask about?" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={captureLead.isPending || confirmed.length === 0}>
              {captureLead.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Leads() {
  const { user } = useAuth();
  const canCapture = hasExhibitorPermission(user?.roles, "lead:capture");
  const canExport = hasExhibitorPermission(user?.roles, "lead:export");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const pageSize = 25;
  const [showAdd, setShowAdd] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingEvents, setIsExportingEvents] = useState(false);
  const [followUpDue, setFollowUpDue] = useState<"OVERDUE" | "TODAY" | "UPCOMING" | "ALL">("ALL");
  const [followUpsAssignedToMe, setFollowUpsAssignedToMe] = useState(false);
  const [followUpSearch, setFollowUpSearch] = useState("");
  const [followUpPage, setFollowUpPage] = useState(1);

  const filters: LeadFilters = {
    search: search || undefined,
    status: status !== "all" ? (status as LeadStatus) : undefined,
    priority: priority !== "all" ? (priority as LeadPriority) : undefined,
  };
  const { data, isLoading, isError, refetch } = useLeads(filters, page, pageSize);
  const leads = data?.leads ?? [];
  const pagination = data?.pagination;
  const { data: analytics } = useExhibitorLeadAnalytics();
  const eventStatus = status === "all" ? undefined : status.toUpperCase();
  const eventPriority = priority === "all" ? undefined : priority.toUpperCase();
  const { data: eventLeadData, isLoading: eventLeadsLoading, isError: eventLeadsError, refetch: refetchEventLeads } = useEventLeads({ search: search || undefined, status: eventStatus, priority: eventPriority }, eventPage, pageSize);
  const eventLeads = eventLeadData?.leads ?? [];
  const eventPagination = eventLeadData?.pagination;
  const { data: eventAnalytics } = useEventLeadAnalytics();
  const canViewLeads = hasExhibitorPermission(user?.roles, "lead:view");
  const { data: followUpData, isLoading: followUpsLoading, isError: followUpsError, refetch: refetchFollowUps } = useEventLeadFollowUps(
    { due: followUpDue, assignedToMe: followUpsAssignedToMe, search: followUpSearch || undefined },
    followUpPage,
    pageSize,
    canViewLeads,
  );
  const updateFollowUp = useUpdateEventLeadFollowUp();
  const followUps = followUpData?.followUps ?? [];
  const followUpPagination = followUpData?.pagination;
  const combinedAnalytics = analytics || eventAnalytics ? {
    totalLeads: (analytics?.totalLeads ?? 0) + (eventAnalytics?.totalLeads ?? 0),
    conversionRate: ((analytics?.totalLeads ?? 0) + (eventAnalytics?.totalLeads ?? 0)) > 0
      ? ((analytics?.convertedLeads ?? 0) + (eventAnalytics?.convertedLeads ?? 0)) / ((analytics?.totalLeads ?? 0) + (eventAnalytics?.totalLeads ?? 0)) : 0,
    followUpsDue: (analytics?.followUpsDue ?? 0) + (eventAnalytics?.followUpsDue ?? 0),
    visitorsInteractedWith: (analytics?.visitorsInteractedWith ?? 0) + (eventAnalytics?.visitorsInteractedWith ?? 0),
  } : undefined;

  const handleEventExport = async () => {
    setIsExportingEvents(true);
    try {
      await exportEventLeads({ search: search || undefined, status: eventStatus, priority: eventPriority });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Event lead export failed");
    } finally {
      setIsExportingEvents(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportLeads(filters);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-muted-foreground">Visitors who showed interest at your exhibition or event</p>
        </div>
        <div className="flex gap-3">
          {canCapture && (
            <Button variant="outline" asChild>
              <Link to="/exhibitor-dashboard/leads/capture">
                <QrCode className="w-4 h-4 mr-2" />
                Capture Visitor
              </Link>
            </Button>
          )}
          {canExport && (
            <Button variant="outline" onClick={handleExport} disabled={isExporting || leads.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          )}
          {canCapture && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Lead
            </Button>
          )}
        </div>
      </div>

      {combinedAnalytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Total Leads" value={combinedAnalytics.totalLeads} icon={Target} />
          <StatCard title="Conversion Rate" value={`${Math.round(combinedAnalytics.conversionRate * 100)}%`} icon={TrendingUp} />
          <StatCard title="Follow-ups Due" value={combinedAnalytics.followUpsDue} icon={Clock} />
          <StatCard title="Visitors Met" value={combinedAnalytics.visitorsInteractedWith} icon={Users} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            aria-label="Search leads by name, email, or phone"
            placeholder="Search by name, email, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setEventPage(1); }}
          />
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); setEventPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(value) => { setPriority(value); setPage(1); setEventPage(1); }}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {priorityOptions.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState label="Loading leads..." />
      ) : isError ? (
        <ErrorState description="Couldn't load leads." onRetry={() => refetch()} />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Leads you capture at your stall will show up here."
          action={
            canCapture ? (
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-4 text-sm font-medium">Visitor</th>
                <th className="text-left p-4 text-sm font-medium">Exhibition</th>
                <th className="text-left p-4 text-sm font-medium">Status</th>
                <th className="text-left p-4 text-sm font-medium">Priority</th>
                <th className="text-left p-4 text-sm font-medium">Assigned To</th>
                <th className="text-left p-4 text-sm font-medium">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-secondary/30">
                  <td className="p-4">
                    <Link to={`/exhibitor-dashboard/leads/${lead.id}`} className="font-medium hover:text-primary">
                      {lead.visitorName ?? lead.ticketBooking?.attendeeName ?? "Unknown"}
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {(lead.visitorEmail ?? lead.ticketBooking?.attendeeEmail) && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {lead.visitorEmail ?? lead.ticketBooking?.attendeeEmail}
                        </span>
                      )}
                      {(lead.visitorPhone ?? lead.ticketBooking?.attendeePhone) && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.visitorPhone ?? lead.ticketBooking?.attendeePhone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground">{lead.exhibitionExhibitor.exhibition.name}</td>
                  <td className="p-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="p-4 capitalize">{lead.priority}</td>
                  <td className="p-4 text-muted-foreground">
                    {lead.assignedToUser?.fullName ?? lead.assignedToUser?.email ?? "Unassigned"}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {lead.followUpDate ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(lead.followUpDate).toLocaleDateString()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            Showing {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} leads
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
              Previous
            </Button>
            <span aria-live="polite">Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={page >= pagination.totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Universal event leads</h2>
            <p className="text-sm text-muted-foreground">Ticket-captured visitors are available here with CRM follow-up and pipeline management.</p>
          </div>
          {canExport && <Button variant="outline" onClick={handleEventExport} disabled={isExportingEvents || eventLeads.length === 0}><Download className="mr-2 h-4 w-4" />{isExportingEvents ? "Exporting..." : "Export event leads"}</Button>}
        </div>
        {eventLeadsLoading ? <LoadingState label="Loading event leads..." /> : eventLeadsError ? (
          <ErrorState description="Couldn't load universal event leads." onRetry={() => refetchEventLeads()} />
        ) : eventLeads.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No universal event leads match these filters.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full">
              <thead className="bg-secondary/50"><tr>
                <th className="p-4 text-left text-sm font-medium">Visitor</th>
                <th className="p-4 text-left text-sm font-medium">Event</th>
                <th className="p-4 text-left text-sm font-medium">Status</th>
                <th className="p-4 text-left text-sm font-medium">Priority</th>
                <th className="p-4 text-left text-sm font-medium">Assigned To</th>
                <th className="p-4 text-left text-sm font-medium">Next Follow-up</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {eventLeads.map((lead) => {
                  const nextFollowUp = lead.followUps.find((item) => item.status === "OPEN");
                  return <tr key={lead.id} className="hover:bg-secondary/30">
                    <td className="p-4">
                      <Link to={"/exhibitor-dashboard/leads/event-" + lead.id} className="font-medium hover:text-primary">{lead.visitorName || "Unknown visitor"}</Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">{lead.visitorEmail || lead.visitorPhone || lead.source.replace(/_/g, " ")}</div>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">{lead.event.title}{lead.stall ? " · " + lead.stall.code : ""}</td>
                    <td className="p-4"><StatusBadge status={lead.status.toLowerCase()} /></td>
                    <td className="p-4 text-sm">{lead.priority.toLowerCase()}</td>
                    <td className="p-4 text-sm text-muted-foreground">{lead.assignedToUser?.fullName ?? lead.assignedToUser?.email ?? "Unassigned"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{nextFollowUp ? new Date(nextFollowUp.dueAt).toLocaleDateString() : "—"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        {eventPagination && eventPagination.total > 0 && <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>Showing {(eventPagination.page - 1) * eventPagination.pageSize + 1}–{Math.min(eventPagination.page * eventPagination.pageSize, eventPagination.total)} of {eventPagination.total} event leads</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEventPage((current) => Math.max(1, current - 1))} disabled={eventPage <= 1}>Previous</Button>
            <span>Page {eventPagination.page} of {Math.max(1, eventPagination.totalPages)}</span>
            <Button variant="outline" size="sm" onClick={() => setEventPage((current) => Math.min(eventPagination.totalPages, current + 1))} disabled={eventPage >= eventPagination.totalPages}>Next</Button>
          </div>
        </div>}
      </section>

      {canViewLeads && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Follow-up work queue</h2>
              <p className="text-sm text-muted-foreground">Track overdue, due-today, and upcoming exhibitor follow-ups across your events.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={followUpDue} onValueChange={(value) => { setFollowUpDue(value as typeof followUpDue); setFollowUpPage(1); }}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Due date" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All open tasks</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                  <SelectItem value="TODAY">Due today</SelectItem>
                  <SelectItem value="UPCOMING">Upcoming</SelectItem>
                </SelectContent>
              </Select>
              <Select value={followUpsAssignedToMe ? "mine" : "all"} onValueChange={(value) => { setFollowUpsAssignedToMe(value === "mine"); setFollowUpPage(1); }}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All team tasks</SelectItem>
                  <SelectItem value="mine">Assigned to me</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            aria-label="Search follow-up tasks by visitor"
            placeholder="Search follow-ups by visitor name, email, or phone..."
            value={followUpSearch}
            onChange={(e) => { setFollowUpSearch(e.target.value); setFollowUpPage(1); }}
          />
          {followUpsLoading ? <LoadingState label="Loading follow-up tasks..." /> : followUpsError ? (
            <ErrorState description="Couldn't load follow-up tasks." onRetry={() => refetchFollowUps()} />
          ) : followUps.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No open follow-ups match these filters.
            </div>
          ) : (
            <div className="space-y-2">
              {followUps.map((item) => {
                const canManageFollowUp = Boolean(item.lead.exhibitorBusiness?.id) &&
                  hasExhibitorPermissionForBusiness(user?.roles, item.lead.exhibitorBusiness!.id, "lead:manage");
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const overdue = new Date(item.dueAt).getTime() < startOfToday.getTime();
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={"/exhibitor-dashboard/leads/event-" + item.lead.id} className="font-medium hover:text-primary">{item.lead.visitorName || "Unknown visitor"}</Link>
                        <StatusBadge status={overdue ? "overdue" : "open"} />
                        <span className="text-xs text-muted-foreground">{item.lead.priority.toLowerCase()} priority</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.lead.event.title}{item.lead.stall ? " · Stall " + item.lead.stall.code : ""}</p>
                      <p className="text-xs text-muted-foreground">Due {new Date(item.dueAt).toLocaleString()} · {item.assignedToUser.fullName ?? item.assignedToUser.email}</p>
                      {item.note && <p className="text-sm">{item.note}</p>}
                    </div>
                    {canManageFollowUp && <Button
                      size="sm"
                      variant="outline"
                      disabled={updateFollowUp.isPending}
                      onClick={() => updateFollowUp.mutate(
                        { id: item.lead.id, followUpId: item.id, status: "COMPLETED" },
                        { onSuccess: () => toast.success("Follow-up completed"), onError: (error) => toast.error(error instanceof Error ? error.message : "Could not complete follow-up") },
                      )}
                    >Mark complete</Button>}
                  </div>
                );
              })}
            </div>
          )}
          {followUpPagination && followUpPagination.total > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>Showing {(followUpPagination.page - 1) * followUpPagination.pageSize + 1}–{Math.min(followUpPagination.page * followUpPagination.pageSize, followUpPagination.total)} of {followUpPagination.total} tasks</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setFollowUpPage((current) => Math.max(1, current - 1))} disabled={followUpPage <= 1}>Previous</Button>
                <span>Page {followUpPagination.page} of {Math.max(1, followUpPagination.totalPages)}</span>
                <Button variant="outline" size="sm" onClick={() => setFollowUpPage((current) => Math.min(followUpPagination.totalPages, current + 1))} disabled={followUpPage >= followUpPagination.totalPages}>Next</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {showAdd && <AddLeadDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}
