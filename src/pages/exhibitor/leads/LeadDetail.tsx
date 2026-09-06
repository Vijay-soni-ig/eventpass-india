import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Calendar, User, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";
import { useLead, useUpdateLead, type LeadStatus, type LeadPriority } from "@/hooks/exhibitor/useLeads";
import { useExhibitorMembers } from "@/hooks/exhibitor/useExhibitorMembers";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermission } from "@/lib/permissions";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";

const statusOptions: LeadStatus[] = ["new", "contacted", "interested", "negotiation", "converted", "lost"];
const priorityOptions: LeadPriority[] = ["low", "medium", "high"];

export default function LeadDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canManage = hasExhibitorPermission(user?.roles, "lead:capture");
  const { data: lead, isLoading, isError, refetch } = useLead(id);
  const { data: members = [] } = useExhibitorMembers(lead?.exhibitionExhibitor.business.id);
  const updateLead = useUpdateLead();

  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  useEffect(() => {
    if (lead) {
      setNotes(lead.notes ?? "");
      setFollowUpDate(lead.followUpDate ? lead.followUpDate.slice(0, 10) : "");
    }
  }, [lead]);

  if (isLoading) return <LoadingState label="Loading lead..." />;
  if (isError || !lead) {
    return (
      <ErrorState
        title="Lead not found"
        description="This lead doesn't exist or you don't have access to it."
        onRetry={() => refetch()}
      />
    );
  }

  const handleStatusChange = (status: LeadStatus) => {
    updateLead.mutate(
      { id: lead.id, status },
      {
        onSuccess: () => toast.success("Status updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update status"),
      }
    );
  };

  const handlePriorityChange = (priority: LeadPriority) => {
    updateLead.mutate(
      { id: lead.id, priority },
      {
        onSuccess: () => toast.success("Priority updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update priority"),
      }
    );
  };

  const handleAssign = (assignedToUserId: string) => {
    updateLead.mutate(
      { id: lead.id, assignedToUserId: assignedToUserId === "unassigned" ? null : assignedToUserId },
      {
        onSuccess: () => toast.success("Assignment updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update assignment"),
      }
    );
  };

  const handleSaveNotesAndFollowUp = () => {
    updateLead.mutate(
      { id: lead.id, notes: notes || null, followUpDate: followUpDate || null },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
      }
    );
  };

  const visitorName = lead.visitorName ?? lead.ticketBooking?.attendeeName ?? "Unknown visitor";
  const visitorEmail = lead.visitorEmail ?? lead.ticketBooking?.attendeeEmail;
  const visitorPhone = lead.visitorPhone ?? lead.ticketBooking?.attendeePhone;

  return (
    <div className="space-y-6 animate-slide-up">
      <DashboardBreadcrumb items={[{ label: "Leads", to: "/exhibitor-dashboard/leads" }]} page={visitorName} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/exhibitor-dashboard/leads">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{visitorName}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="text-muted-foreground">{lead.exhibitionExhibitor.exhibition.name}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <User className="w-4 h-4 text-primary" />
          Contact
        </h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {visitorEmail && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4" />
              {visitorEmail}
            </p>
          )}
          {visitorPhone && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              {visitorPhone}
            </p>
          )}
          <p className="flex items-center gap-2 text-muted-foreground">
            <QrCode className="w-4 h-4" />
            Captured via {lead.source === "qr_scan" ? "QR scan" : "manual entry"} on{" "}
            {new Date(lead.capturedAt).toLocaleDateString()}
          </p>
          {lead.capturedByUser && (
            <p className="text-muted-foreground">
              By {lead.capturedByUser.fullName ?? lead.capturedByUser.email}
            </p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">Pipeline</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Status</Label>
            <Select value={lead.status} onValueChange={(v) => handleStatusChange(v as LeadStatus)} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Priority</Label>
            <Select value={lead.priority} onValueChange={(v) => handlePriorityChange(v as LeadPriority)} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Assigned To</Label>
            <Select value={lead.assignedToUserId ?? "unassigned"} onValueChange={handleAssign} disabled={!canManage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members
                  .filter((m) => m.userId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.userId!}>
                      {m.invitedEmail ?? m.userId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          Follow-up & Notes
        </h3>
        <div className="space-y-2">
          <Label className="text-xs">Follow-up Date</Label>
          <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} disabled={!canManage} className="max-w-xs" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} disabled={!canManage} placeholder="What did they need? Next steps..." />
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button onClick={handleSaveNotesAndFollowUp} disabled={updateLead.isPending}>
              {updateLead.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
