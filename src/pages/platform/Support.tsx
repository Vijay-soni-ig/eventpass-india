import { useState } from "react";
import { Search, LifeBuoy, Plus, Send, StickyNote, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformBreadcrumb } from "@/components/platform/PlatformBreadcrumb";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useSupportTickets,
  useSupportTicket,
  useCreateSupportTicket,
  useUpdateSupportTicket,
  useAddSupportMessage,
  usePlatformOrganizers,
  type SupportTicketStatus,
  type SupportTicketPriority,
  type SupportTicketCategory,
} from "@/hooks/platform/usePlatformAdmin";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/apiClient";

const STATUS_OPTIONS: SupportTicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
const PRIORITY_OPTIONS: SupportTicketPriority[] = ["low", "medium", "high", "urgent"];
const CATEGORY_OPTIONS: SupportTicketCategory[] = ["account", "exhibition", "exhibitor", "visitor", "payment", "subscription", "technical", "other"];

const PRIORITY_TONE: Record<SupportTicketPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-primary",
  high: "text-warning",
  urgent: "text-destructive",
};

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CreateTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
}) {
  const create = useCreateSupportTicket();
  const { data: organizers = [] } = usePlatformOrganizers();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("other");
  const [priority, setPriority] = useState<SupportTicketPriority>("medium");
  const [organizerId, setOrganizerId] = useState<string>("none");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");

  const reset = () => {
    setSubject("");
    setDescription("");
    setCategory("other");
    setPriority("medium");
    setOrganizerId("none");
    setRequesterName("");
    setRequesterEmail("");
  };

  const handleSubmit = () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Subject and description are required");
      return;
    }
    create.mutate(
      {
        subject,
        description,
        category,
        priority,
        organizerId: organizerId !== "none" ? organizerId : undefined,
        requesterName: requesterName || undefined,
        requesterEmail: requesterEmail || undefined,
      },
      {
        onSuccess: (ticket) => {
          toast.success("Ticket created");
          reset();
          onOpenChange(false);
          onCreated(ticket.id);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to create ticket"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Support Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Unable to publish exhibition" />
          </div>
          <div>
            <Label className="text-xs">Organizer</Label>
            <Select value={organizerId} onValueChange={setOrganizerId}>
              <SelectTrigger>
                <SelectValue placeholder="No organizer linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No organizer linked</SelectItem>
                {organizers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Requester name</Label>
              <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Karthik Subramaniam" />
            </div>
            <div>
              <Label className="text-xs">Requester email</Label>
              <Input value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} placeholder="karthik@example.com" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SupportTicketCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as SupportTicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the issue..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            Create Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDrawer({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { data: ticket, isLoading, isError, refetch } = useSupportTicket(ticketId);
  const update = useUpdateSupportTicket();
  const addMessage = useAddSupportMessage();
  const [reply, setReply] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "That action failed");

  const handleSend = () => {
    if (!reply.trim()) return;
    addMessage.mutate(
      { ticketId, body: reply, isInternalNote },
      {
        onSuccess: () => {
          setReply("");
          setIsInternalNote(false);
        },
        onError,
      }
    );
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto flex flex-col">
        {isLoading ? (
          <LoadingState label="Loading ticket..." />
        ) : isError || !ticket ? (
          <ErrorState description="Couldn't load this ticket." onRetry={() => refetch()} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{ticket.subject}</SheetTitle>
            </SheetHeader>

            <div className="mt-3 space-y-3">
              <div className="text-sm text-muted-foreground">
                {ticket.requesterName ?? ticket.requesterEmail ?? "Unknown requester"}
                {ticket.organizer && <> · {ticket.organizer.name}</>}
                {" · "}Opened {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => update.mutate({ id: ticket.id, status: v as SupportTicketStatus }, { onError })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => update.mutate({ id: ticket.id, priority: v as SupportTicketPriority }, { onError })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
                <div className="text-sm">
                  {ticket.assignedToUser ? (
                    <>
                      Assigned to <span className="font-medium">{ticket.assignedToUser.fullName ?? ticket.assignedToUser.email}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </div>
                {ticket.assignedToUserId === user?.id ? (
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: ticket.id, assignedToUserId: null }, { onError })}>
                    Unassign
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => user && update.mutate({ id: ticket.id, assignedToUserId: user.id }, { onError })}
                  >
                    Assign to me
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-5 flex-1 space-y-3">
              <p className="text-sm font-medium">Conversation</p>
              <div className="space-y-2">
                {ticket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg p-3 text-sm",
                      m.isInternalNote
                        ? "bg-warning/10 border border-warning/30"
                        : m.authorUserId === ticket.requesterUserId
                          ? "bg-muted"
                          : "bg-primary/5 border border-primary/20"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {m.isInternalNote && <StickyNote className="inline w-3 h-3 mr-1" />}
                        {m.authorUser?.fullName ?? m.authorUser?.email ?? "Requester"}
                        {m.isInternalNote && " · Internal note"}
                      </span>
                      <span className="text-xs text-muted-foreground">{relativeTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a reply or internal note..." />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} />
                  Internal note (never visible to the requester)
                </label>
                <Button size="sm" onClick={handleSend} disabled={addMessage.isPending || !reply.trim()}>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {isInternalNote ? "Add Note" : "Reply"}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type AssignedFilter = "all" | "mine" | "unassigned";
type QuickFilter = "all" | "open" | "mine" | "urgent" | "unassigned" | "resolved";

export default function PlatformSupport() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<SupportTicketPriority | "all">("all");
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filters: Parameters<typeof useSupportTickets>[0] = { search: search || undefined };
  if (statusFilter !== "all") filters.status = statusFilter;
  if (priorityFilter !== "all") filters.priority = priorityFilter;
  if (assignedFilter === "mine") filters.assignedToUserId = user?.id;
  if (assignedFilter === "unassigned") filters.unassigned = true;

  const activeQuickFilter: QuickFilter =
    statusFilter === "all" && priorityFilter === "all" && assignedFilter === "all"
      ? "all"
      : statusFilter === "open" && priorityFilter === "all" && assignedFilter === "all"
        ? "open"
        : assignedFilter === "mine" && statusFilter === "all" && priorityFilter === "all"
          ? "mine"
          : priorityFilter === "urgent" && statusFilter === "all" && assignedFilter === "all"
            ? "urgent"
            : assignedFilter === "unassigned" && statusFilter === "all" && priorityFilter === "all"
              ? "unassigned"
              : statusFilter === "resolved" && priorityFilter === "all" && assignedFilter === "all"
                ? "resolved"
                : "all";

  const applyQuickFilter = (f: QuickFilter) => {
    setStatusFilter(f === "open" ? "open" : f === "resolved" ? "resolved" : "all");
    setPriorityFilter(f === "urgent" ? "urgent" : "all");
    setAssignedFilter(f === "mine" ? "mine" : f === "unassigned" ? "unassigned" : "all");
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setAssignedFilter("all");
  };

  const { data, isLoading, isError, refetch } = useSupportTickets(filters);
  const tickets = data ?? [];

  const allTicketsQuery = useSupportTickets({});
  const allTickets = allTicketsQuery.data ?? [];
  const todayStr = new Date().toDateString();
  const kpis = [
    { label: "Open", value: allTickets.filter((t) => t.status === "open").length },
    { label: "In Progress", value: allTickets.filter((t) => t.status === "in_progress").length },
    { label: "Waiting", value: allTickets.filter((t) => t.status === "waiting_customer").length },
    { label: "Resolved", value: allTickets.filter((t) => t.status === "resolved").length },
    { label: "Unassigned", value: allTickets.filter((t) => !t.assignedToUser).length },
    { label: "High Priority", value: allTickets.filter((t) => t.priority === "high" || t.priority === "urgent").length },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      <PlatformBreadcrumb page="Support" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-muted-foreground">Manage organizer, exhibitor and platform support requests.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-lg p-3.5">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-semibold mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 -my-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search tickets..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SupportTicketStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as SupportTicketPriority | "all")}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as AssignedFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Assigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              <SelectItem value="mine">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
          {(search || activeQuickFilter !== "all") && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          {(["all", "open", "mine", "urgent", "unassigned", "resolved"] as QuickFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => applyQuickFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium capitalize border transition-colors",
                activeQuickFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary/50"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading tickets..." />
      ) : isError ? (
        <ErrorState description="Couldn't load support tickets." onRetry={() => refetch()} />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="You're all caught up."
          description="No support requests require attention."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Ticket
            </Button>
          }
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ticket</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Priority</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Assignee</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Updated</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <p className="text-sm font-medium">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      #{t.id.slice(0, 8)} · {t.requesterName ?? t.requesterEmail ?? "Unknown requester"}
                    </p>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{t.organizer?.name ?? "—"}</td>
                  <td className={cn("p-3 text-sm font-medium capitalize", PRIORITY_TONE[t.priority])}>{t.priority}</td>
                  <td className="p-3 text-sm text-muted-foreground">{t.assignedToUser?.fullName ?? t.assignedToUser?.email ?? "Unassigned"}</td>
                  <td className="p-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{relativeTime(t.lastActivityAt)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setSelectedId(t.id)}>
                      View <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => setSelectedId(id)} />
      {selectedId && <TicketDetailDrawer ticketId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
