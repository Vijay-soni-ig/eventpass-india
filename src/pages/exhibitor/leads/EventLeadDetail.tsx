import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Mail, Phone, MessageSquare, Plus, User, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";
import { useEventLead, useUpdateEventLead, useAddEventLeadInteraction, useAddEventLeadFollowUp, useUpdateEventLeadFollowUp, useArchiveEventLead, type EventLeadStatus, type EventLeadPriority, type EventLeadInteractionType } from "@/hooks/exhibitor/useEventLeads";
import { useExhibitorMembers } from "@/hooks/exhibitor/useExhibitorMembers";
import { useAuth } from "@/hooks/useAuth";
import { hasExhibitorPermissionForBusiness } from "@/lib/permissions";
import { DashboardBreadcrumb } from "@/components/dashboard/DashboardBreadcrumb";

const statuses: EventLeadStatus[] = ["NEW", "CONTACTED", "INTERESTED", "QUALIFIED", "NEGOTIATION", "CONVERTED", "LOST"];
const priorities: EventLeadPriority[] = ["LOW", "MEDIUM", "HIGH"];

export default function EventLeadDetail({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: lead, isLoading, isError, refetch } = useEventLead(leadId);
  const businessId = lead?.exhibitorBusinessId ?? undefined;
  const canManage = hasExhibitorPermissionForBusiness(user?.roles, businessId, "lead:manage");
  const canViewMembers = hasExhibitorPermissionForBusiness(user?.roles, businessId, "exhibitorMember:view");
  const { data: members = [] } = useExhibitorMembers(businessId, canManage && canViewMembers);
  const update = useUpdateEventLead();
  const addInteraction = useAddEventLeadInteraction();
  const addFollowUp = useAddEventLeadFollowUp();
  const updateFollowUp = useUpdateEventLeadFollowUp();
  const archive = useArchiveEventLead();
  const [notes, setNotes] = useState("");
  const [interactionType, setInteractionType] = useState<EventLeadInteractionType>("NOTE");
  const [interactionNote, setInteractionNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpAssignee, setFollowUpAssignee] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editingFollowUpDate, setEditingFollowUpDate] = useState("");
  const [editingFollowUpAssignee, setEditingFollowUpAssignee] = useState("");
  const [editingFollowUpNote, setEditingFollowUpNote] = useState("");

  useEffect(() => { setNotes(lead?.notes ?? ""); }, [lead?.id, lead?.notes]);

  if (isLoading) return <LoadingState label="Loading event lead..." />;
  if (isError || !lead) return <ErrorState title="Lead not found" description="This lead doesn't exist or you don't have access to it." onRetry={() => refetch()} />;

  const handleArchive = () => {
    if (!window.confirm("Archive this lead? It will be removed from the active CRM list and analytics.")) return;
    archive.mutate(lead.id, {
      onSuccess: () => { toast.success("Lead archived"); navigate("/exhibitor-dashboard/leads"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive lead"),
    });
  };

  const visitorName = lead.visitorName || "Unknown visitor";
  const saveNotes = () => update.mutate({ id: lead.id, notes: notes.trim() || null }, {
    onSuccess: () => toast.success("Notes saved"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save notes"),
  });
  const addNote = () => {
    if (!interactionNote.trim()) return;
    addInteraction.mutate({ id: lead.id, type: interactionType, note: interactionNote.trim() }, {
      onSuccess: () => { setInteractionNote(""); toast.success("Interaction recorded"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not record interaction"),
    });
  };
  const createFollowUp = () => {
    if (!followUpDate || !followUpAssignee) return toast.error("Choose a due date and team member");
    addFollowUp.mutate({ id: lead.id, assignedToUserId: followUpAssignee, dueAt: new Date(followUpDate + "T12:00:00").toISOString(), note: followUpNote.trim() || undefined }, {
      onSuccess: () => { setFollowUpDate(""); setFollowUpNote(""); toast.success("Follow-up scheduled"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not schedule follow-up"),
    });
  };
  const beginEditFollowUp = (item: typeof lead.followUps[number]) => {
    setEditingFollowUpId(item.id);
    setEditingFollowUpDate(new Date(item.dueAt).toISOString().slice(0, 10));
    setEditingFollowUpAssignee(item.assignedToUser.id);
    setEditingFollowUpNote(item.note ?? "");
  };
  const saveFollowUp = () => {
    if (!editingFollowUpId || !editingFollowUpDate || !editingFollowUpAssignee) return toast.error("Choose a due date and team member");
    updateFollowUp.mutate({
      id: lead.id,
      followUpId: editingFollowUpId,
      dueAt: new Date(editingFollowUpDate + "T12:00:00").toISOString(),
      assignedToUserId: editingFollowUpAssignee,
      note: editingFollowUpNote.trim() || null,
    }, {
      onSuccess: () => { setEditingFollowUpId(null); toast.success("Follow-up updated"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update follow-up"),
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <DashboardBreadcrumb items={[{ label: "Leads", to: "/exhibitor-dashboard/leads" }]} page={visitorName} />
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/exhibitor-dashboard/leads"><ArrowLeft className="w-5 h-5" /></Link></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{visitorName}</h1><StatusBadge status={lead.status.toLowerCase()} /></div>
          <p className="text-muted-foreground">{lead.event.title}{lead.stall ? " · Stall " + lead.stall.code : ""}</p>
        </div>
        {canManage && lead.status !== "ARCHIVED" && <Button variant="destructive" onClick={handleArchive} disabled={archive.isPending}>{archive.isPending ? "Archiving..." : "Archive lead"}</Button>}
      </div>

      <section className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Visitor details</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {lead.visitorEmail && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" />{lead.visitorEmail}</p>}
          {lead.visitorPhone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{lead.visitorPhone}</p>}
          <p className="flex items-center gap-2 text-muted-foreground"><QrCode className="h-4 w-4" />{lead.source.replace(/_/g, " ").toLowerCase()} · {new Date(lead.createdAt).toLocaleString()}</p>
          {lead.capturedByUser && <p className="text-muted-foreground">Captured by {lead.capturedByUser.fullName ?? lead.capturedByUser.email}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Lead pipeline</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2"><Label>Status</Label><Select value={lead.status} onValueChange={(value) => update.mutate({ id: lead.id, status: value as EventLeadStatus }, { onSuccess: () => toast.success("Status updated"), onError: (e) => toast.error(e.message) })} disabled={!canManage || lead.status === "ARCHIVED"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{statuses.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Priority</Label><Select value={lead.priority} onValueChange={(value) => update.mutate({ id: lead.id, priority: value as EventLeadPriority }, { onSuccess: () => toast.success("Priority updated"), onError: (e) => toast.error(e.message) })} disabled={!canManage || lead.status === "ARCHIVED"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Assigned to</Label><Select value={lead.assignedToUserId ?? "unassigned"} onValueChange={(value) => update.mutate({ id: lead.id, assignedToUserId: value === "unassigned" ? null : value }, { onSuccess: () => toast.success("Assignment updated"), onError: (e) => toast.error(e.message) })} disabled={!canManage || lead.status === "ARCHIVED"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{members.filter((m) => m.userId).map((m) => <SelectItem key={m.id} value={m.userId!}>{m.invitedEmail ?? m.userId}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label>CRM notes</Label><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canManage || lead.status === "ARCHIVED"} placeholder="Record requirements and next steps..." /></div>
        {canManage && <div className="flex justify-end"><Button onClick={saveNotes} disabled={update.isPending || lead.status === "ARCHIVED"}>Save notes</Button></div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Interaction history</h2>
        {lead.interactions.length ? <div className="space-y-3">{lead.interactions.map((item) => <div key={item.id} className="rounded-lg bg-secondary/40 p-3"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{item.type} · {item.createdByUser.fullName ?? item.createdByUser.email}</span><span>{new Date(item.createdAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm">{item.note}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No interactions recorded yet.</p>}
        {canManage && <div className="space-y-3 border-t border-border pt-4"><div className="grid gap-3 sm:grid-cols-[160px_1fr]"><Select value={interactionType} onValueChange={(v) => setInteractionType(v as EventLeadInteractionType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["NOTE","CALL","EMAIL","WHATSAPP","MEETING","OTHER"] as EventLeadInteractionType[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select><Textarea value={interactionNote} onChange={(e) => setInteractionNote(e.target.value)} placeholder="Add call notes, email summary, or visitor interaction..." rows={2} /></div><div className="flex justify-end"><Button onClick={addNote} disabled={!interactionNote.trim() || addInteraction.isPending || lead.status === "ARCHIVED"}><Plus className="mr-2 h-4 w-4" />Add interaction</Button></div></div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Follow-ups</h2>
        {lead.followUps.length ? <div className="space-y-2">{lead.followUps.map((item) => <div key={item.id} className="rounded-lg bg-secondary/40 p-3 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{new Date(item.dueAt).toLocaleString()} · {item.assignedToUser.fullName ?? item.assignedToUser.email}</p><p className="text-xs text-muted-foreground">{item.note || "No note"} · {item.status}</p></div>{canManage && <div className="flex flex-wrap gap-2">{item.status === "OPEN" ? <><Button size="sm" variant="outline" onClick={() => beginEditFollowUp(item)}>Edit</Button><Button size="sm" variant="outline" disabled={updateFollowUp.isPending} onClick={() => updateFollowUp.mutate({ id: lead.id, followUpId: item.id, status: "COMPLETED" }, { onSuccess: () => toast.success("Follow-up completed"), onError: (e) => toast.error(e.message) })}>Mark complete</Button><Button size="sm" variant="ghost" disabled={updateFollowUp.isPending} onClick={() => updateFollowUp.mutate({ id: lead.id, followUpId: item.id, status: "CANCELLED" }, { onSuccess: () => toast.success("Follow-up cancelled"), onError: (e) => toast.error(e.message) })}>Cancel</Button></> : <Button size="sm" variant="outline" disabled={updateFollowUp.isPending} onClick={() => updateFollowUp.mutate({ id: lead.id, followUpId: item.id, status: "OPEN" }, { onSuccess: () => toast.success("Follow-up reopened"), onError: (e) => toast.error(e.message) })}>Reopen</Button>}</div>}</div>{canManage && editingFollowUpId === item.id && <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3"><div className="space-y-2"><Label>Due date</Label><Input type="date" value={editingFollowUpDate} onChange={(e) => setEditingFollowUpDate(e.target.value)} /></div><div className="space-y-2"><Label>Assign to</Label><Select value={editingFollowUpAssignee} onValueChange={setEditingFollowUpAssignee}><SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger><SelectContent>{members.filter((m) => m.userId).map((m) => <SelectItem key={m.id} value={m.userId!}>{m.invitedEmail ?? m.userId}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Note</Label><Input value={editingFollowUpNote} onChange={(e) => setEditingFollowUpNote(e.target.value)} /></div><div className="sm:col-span-3 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingFollowUpId(null)}>Discard</Button><Button size="sm" onClick={saveFollowUp} disabled={updateFollowUp.isPending || !editingFollowUpDate || !editingFollowUpAssignee}>Save changes</Button></div></div>}</div>)}</div> : <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>}
        {canManage && <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3"><div className="space-y-2"><Label>Due date</Label><Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></div><div className="space-y-2"><Label>Assign to</Label><Select value={followUpAssignee} onValueChange={setFollowUpAssignee}><SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger><SelectContent>{members.filter((m) => m.userId).map((m) => <SelectItem key={m.id} value={m.userId!}>{m.invitedEmail ?? m.userId}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Note</Label><Input value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="Optional next step" /></div><div className="sm:col-span-3 flex justify-end"><Button onClick={createFollowUp} disabled={!followUpDate || !followUpAssignee || addFollowUp.isPending || lead.status === "ARCHIVED"}>Schedule follow-up</Button></div></div>}
      </section>
    </div>
  );
}
