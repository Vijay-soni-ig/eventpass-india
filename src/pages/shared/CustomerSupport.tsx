import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, MessageSquare, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { api, getActiveExhibitorBusinessId, setActiveExhibitorBusinessId } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";

type WorkspaceType = "organizer" | "exhibitor";
type OwnerSelection =
  | { type: "organizer"; organizerId: string }
  | { type: "exhibitor"; exhibitorBusinessId: string };
type SupportStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  organizer?: { id: string; name: string } | null;
  exhibitorBusiness?: { id: string; companyName: string | null } | null;
}
interface SupportMessage {
  id: string;
  body: string;
  createdAt: string;
  authorUser: { id: string; fullName: string | null } | null;
}
interface TicketDetail extends SupportTicket { messages: SupportMessage[] }
interface TicketPage {
  tickets: SupportTicket[];
  pageInfo: { hasMore: boolean; nextCursor: string | null; pageSize: number };
}
const statusLabels: Record<SupportStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_customer: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
};
const statusStyles: Record<SupportStatus, string> = {
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  waiting_customer: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  resolved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};
const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const ownerQuery = (owner: OwnerSelection) => encodeURIComponent(JSON.stringify(owner));

export default function CustomerSupport({ workspaceType }: { workspaceType: WorkspaceType }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedOwnerKey, setSelectedOwnerKey] = useState(() => workspaceType === "exhibitor" ? getActiveExhibitorBusinessId() ?? "" : "");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("technical");
  const [description, setDescription] = useState("");
  const [reply, setReply] = useState("");

  const owners = useMemo< { key: string; label: string; selection: OwnerSelection }[] >(() => {
    if (workspaceType === "organizer") {
      return (user?.roles.organizer ?? []).map((membership) => ({
        key: membership.organizerId,
        label: membership.name || "Organizer workspace",
        selection: { type: "organizer", organizerId: membership.organizerId },
      }));
    }
    return (user?.roles.exhibitor ?? []).map((membership) => ({
      key: membership.exhibitorBusinessId,
      label: membership.name || "Exhibitor business",
      selection: { type: "exhibitor", exhibitorBusinessId: membership.exhibitorBusinessId },
    }));
  }, [user?.roles, workspaceType]);

  useEffect(() => {
    if (!owners.length) {
      setSelectedOwnerKey("");
      return;
    }
    if (!owners.some((owner) => owner.key === selectedOwnerKey)) {
      const next = owners[0].key;
      setSelectedOwnerKey(next);
      if (workspaceType === "exhibitor") setActiveExhibitorBusinessId(next);
    }
  }, [owners, selectedOwnerKey, workspaceType]);

  const selectedOwner = owners.find((owner) => owner.key === selectedOwnerKey)?.selection;
  const ownerParam = selectedOwner ? ownerQuery(selectedOwner) : "";
  const ticketsQuery = useInfiniteQuery({
    queryKey: ["customer-support-tickets", workspaceType, ownerParam],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (selectedOwner) params.set("owner", JSON.stringify(selectedOwner));
      if (pageParam) params.set("cursor", pageParam);
      return api.get<TicketPage>(`/api/support/customer?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: !!selectedOwner,
  });
  const tickets = ticketsQuery.data?.pages.flatMap((page) => page.tickets) ?? [];

  useEffect(() => {
    if (selectedTicketId && !tickets.some((ticket) => ticket.id === selectedTicketId)) setSelectedTicketId("");
  }, [tickets, selectedTicketId]);

  const detailQuery = useQuery({
    queryKey: ["customer-support-ticket", selectedTicketId],
    queryFn: () => api.get<{ ticket: TicketDetail }>(`/api/support/customer/${selectedTicketId}`).then((result) => result.ticket),
    enabled: !!selectedTicketId,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedOwner) throw new Error("Select a workspace first.");
      return api.post<{ ticket: TicketDetail }>("/api/support/customer", {
        owner: selectedOwner,
        subject: subject.trim(),
        description: description.trim(),
        category,
      });
    },
    onSuccess: async ({ ticket }) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      setSelectedTicketId(ticket.id);
      setShowCreate(false);
      setSubject("");
      setDescription("");
      setCategory("technical");
      toast.success("Support request submitted.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not submit your request."),
  });

  const replyMutation = useMutation({
    mutationFn: () => api.post<{ message: SupportMessage; ticket: { id: string; status: SupportStatus } }>(
      `/api/support/customer/${selectedTicketId}/messages`, { body: reply.trim() }
    ),
    onSuccess: async () => {
      setReply("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-support-ticket", selectedTicketId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] }),
      ]);
      toast.success("Reply sent.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send your reply."),
  });

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < 3 || description.trim().length < 10) return;
    createMutation.mutate();
  };
  const submitReply = (event: FormEvent) => {
    event.preventDefault();
    if (reply.trim()) replyMutation.mutate();
  };

  if (!user) return <LoadingState label="Loading your workspace..." />;

  const workspaceLabel = workspaceType === "organizer" ? "Organizer" : "Exhibitor";
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 animate-slide-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><LifeBuoy className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-semibold">Support</h1><p className="text-sm text-muted-foreground">Get help from the ExhibitTix support team and track your requests.</p></div>
        </div>
        <Button onClick={() => { setSelectedTicketId(""); setShowCreate((value) => !value); }}>
          <Plus className="mr-2 h-4 w-4" /> New support request
        </Button>
      </header>

      {owners.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <label htmlFor="support-workspace" className="mb-2 block text-sm font-medium">Support workspace</label>
          <select id="support-workspace" value={selectedOwnerKey} onChange={(event) => {
            setSelectedOwnerKey(event.target.value);
            if (workspaceType === "exhibitor") setActiveExhibitorBusinessId(event.target.value);
            setSelectedTicketId("");
          }} className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm">
            {owners.map((owner) => <option key={owner.key} value={owner.key}>{owner.label}</option>)}
          </select>
        </div>
      )}

      {owners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <LifeBuoy className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No support workspace available</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your account does not currently have an active {workspaceLabel.toLowerCase()} workspace with support access.</p>
        </div>
      ) : (
        <>
          {showCreate && (
            <form onSubmit={submitCreate} className="space-y-4 rounded-xl border border-border bg-card p-5">
              <div><h2 className="font-semibold">Create a support request</h2><p className="text-sm text-muted-foreground">Describe the issue and our team will follow up.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><label htmlFor="support-subject" className="text-sm font-medium">Subject</label><Input id="support-subject" value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={180} required placeholder="Briefly describe what you need help with" /></div>
                <div className="space-y-2"><label htmlFor="support-category" className="text-sm font-medium">Category</label><select id="support-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="account">Account</option><option value="exhibition">Exhibition</option><option value="exhibitor">Exhibitor</option><option value="visitor">Visitor</option><option value="payment">Payment</option><option value="subscription">Subscription</option><option value="technical">Technical</option><option value="other">Other</option></select></div>
              </div>
              <div className="space-y-2"><label htmlFor="support-description" className="text-sm font-medium">Description</label><Textarea id="support-description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={5000} rows={5} required placeholder="Include the steps you took and what happened..." /><p className="text-xs text-muted-foreground text-right">{description.length}/5000</p></div>
              <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button type="submit" disabled={createMutation.isPending || subject.trim().length < 3 || description.trim().length < 10}>{createMutation.isPending ? "Submitting..." : "Submit request"}</Button></div>
            </form>
          )}

          <div className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
            <section className={`overflow-hidden rounded-xl border border-border bg-card ${selectedTicketId ? "hidden lg:block" : ""}`}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-semibold">Your requests</h2><p className="text-xs text-muted-foreground">Tickets for this workspace</p></div><span className="text-xs text-muted-foreground">{tickets.length} shown</span></div>
              {ticketsQuery.isLoading ? <div className="p-6"><LoadingState label="Loading support requests..." /></div>
                : ticketsQuery.isError ? <div className="p-5"><p className="text-sm text-destructive">We couldn't load your requests.</p><Button className="mt-3" size="sm" variant="outline" onClick={() => void ticketsQuery.refetch()}>Try again</Button></div>
                : tickets.length === 0 ? <div className="px-5 py-12 text-center"><MessageSquare className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-medium">No requests yet</p><p className="mt-1 text-sm text-muted-foreground">Create a request if you need help.</p></div>
                : <div className="max-h-[620px] divide-y divide-border overflow-y-auto">{tickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => { setShowCreate(false); setSelectedTicketId(ticket.id); }} className={`w-full p-4 text-left transition-colors hover:bg-muted/60 ${selectedTicketId === ticket.id ? "bg-primary/5" : ""}`} aria-pressed={selectedTicketId === ticket.id}><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-medium">{ticket.subject}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[ticket.status]}`}>{statusLabels[ticket.status]}</span></div><div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="capitalize">{ticket.category}</span><span>{formatDate(ticket.updatedAt)}</span></div></button>)}</div>}
              {ticketsQuery.hasNextPage && <div className="border-t border-border p-3"><Button className="w-full" size="sm" variant="outline" onClick={() => void ticketsQuery.fetchNextPage()} disabled={ticketsQuery.isFetchingNextPage}>{ticketsQuery.isFetchingNextPage ? "Loading..." : "Load more requests"}</Button></div>}
            </section>

            <section className={`min-h-[520px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card ${selectedTicketId ? "flex" : "hidden lg:flex"}`}>
              {!selectedTicketId ? <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center"><MessageSquare className="h-9 w-9 text-muted-foreground" /><h2 className="mt-3 font-semibold">Select a support request</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a request to view its conversation, or create a new one.</p></div>
                : detailQuery.isLoading ? <div className="p-6"><LoadingState label="Loading conversation..." /></div>
                : detailQuery.isError ? <div className="p-6"><ErrorState title="Couldn't load this request" description="The request may be unavailable. Try again." onRetry={() => void detailQuery.refetch()} /></div>
                : detailQuery.data ? <>
                  <div className="border-b border-border p-4 sm:p-5"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setSelectedTicketId("")} className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Back to requests"><ArrowLeft className="h-4 w-4" /></button><h2 className="min-w-0 flex-1 text-lg font-semibold">{detailQuery.data.subject}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[detailQuery.data.status]}`}>{statusLabels[detailQuery.data.status]}</span></div><p className="mt-2 text-xs text-muted-foreground">#{detailQuery.data.id.slice(0, 8)} · {detailQuery.data.category} · Updated {formatDate(detailQuery.data.updatedAt)}</p></div>
                  <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{detailQuery.data.messages.map((message) => <article key={message.id} className="rounded-lg border border-border bg-muted/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{message.authorUser?.fullName || "Support team"}</span><time className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p></article>)}</div>
                  {detailQuery.data.status === "closed" ? <div className="border-t border-border p-4 text-sm text-muted-foreground">This request is closed and can no longer receive replies.</div> : <form onSubmit={submitReply} className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-2"><label htmlFor="support-reply" className="text-sm font-medium">Your reply</label><Textarea id="support-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={3} placeholder="Write a reply..." /></div><Button type="submit" disabled={replyMutation.isPending || !reply.trim()}><Send className="mr-2 h-4 w-4" />{replyMutation.isPending ? "Sending..." : "Send reply"}</Button></form>}
                </> : null}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
