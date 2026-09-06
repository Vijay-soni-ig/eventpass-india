import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Filter, Download, Plus, Target, Mail, Phone, Calendar, Users, Clock, TrendingUp } from "lucide-react";
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
import { hasExhibitorPermission } from "@/lib/permissions";

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
  const [showAdd, setShowAdd] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const filters: LeadFilters = {
    search: search || undefined,
    status: status !== "all" ? (status as LeadStatus) : undefined,
    priority: priority !== "all" ? (priority as LeadPriority) : undefined,
  };
  const { data: leads = [], isLoading, isError, refetch } = useLeads(filters);
  const { data: analytics } = useExhibitorLeadAnalytics();

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
          <p className="text-muted-foreground">Visitors who showed interest at your stall</p>
        </div>
        <div className="flex gap-3">
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

      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Total Leads" value={analytics.totalLeads} icon={Target} />
          <StatCard title="Conversion Rate" value={`${Math.round(analytics.conversionRate * 100)}%`} icon={TrendingUp} />
          <StatCard title="Follow-ups Due" value={analytics.followUpsDue} icon={Clock} />
          <StatCard title="Visitors Met" value={analytics.visitorsInteractedWith} icon={Users} />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
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
        <Select value={priority} onValueChange={setPriority}>
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

      {showAdd && <AddLeadDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}
