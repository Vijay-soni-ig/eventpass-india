import { useState } from "react";
import { Megaphone, MessageCircle, Plus, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useEvents } from "@/hooks/useEvents";
import { useCancelWhatsAppCampaign, useCreateWhatsAppCampaign, useSendWhatsAppCampaign, useWhatsAppCampaigns, type WhatsAppCampaign } from "@/hooks/organizer/useWhatsAppCampaigns";
import { toast } from "sonner";

const labels = { CONFIRMED_REGISTRATIONS: "Confirmed registrations", TICKET_HOLDERS: "Ticket holders" };

export default function Marketing() {
  const { data, isLoading: eventsLoading } = useEvents({ page: 1, limit: 100 });
  const events = data?.events ?? [];
  const [eventId, setEventId] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<WhatsAppCampaign["audience"]>("CONFIRMED_REGISTRATIONS");
  const selectedEventId = eventId || events[0]?.id;
  const campaigns = useWhatsAppCampaigns(selectedEventId);
  const create = useCreateWhatsAppCampaign();
  const send = useSendWhatsAppCampaign();
  const cancel = useCancelWhatsAppCampaign();

  const reset = () => { setName(""); setMessage(""); setAudience("CONFIRMED_REGISTRATIONS"); setOpen(false); };
  const save = async () => {
    if (!selectedEventId || name.trim().length < 2 || !message.trim()) return;
    try { await create.mutateAsync({ eventId: selectedEventId, name: name.trim(), message: message.trim(), audience }); toast.success("Campaign saved as draft."); reset(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not create campaign."); }
  };
  const doSend = async (c: WhatsAppCampaign) => {
    if (!window.confirm(`Queue “${c.name}” for opted-in ${labels[c.audience].toLowerCase()}?`)) return;
    try { const r = await send.mutateAsync(c.id); toast.success(`Campaign queued for ${r.queuedRecipients} recipient(s).`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not queue campaign."); }
  };
  const doCancel = async (c: WhatsAppCampaign) => {
    if (!window.confirm(`Cancel “${c.name}”?`)) return;
    try { await cancel.mutateAsync(c.id); toast.success("Campaign cancelled."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not cancel campaign."); }
  };

  if (eventsLoading) return <LoadingState label="Loading events..." />;
  if (!events.length) return <EmptyState icon={Megaphone} title="Create an event first" description="Marketing campaigns are tied to an event." />;

  return <div className="space-y-6 animate-slide-up">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold">Marketing</h1><p className="text-muted-foreground">Create and manage WhatsApp campaigns for your events.</p></div><Button onClick={() => setOpen(v => !v)}><Plus className="mr-2 h-4 w-4" />New campaign</Button></div>
    <div className="rounded-xl border border-border bg-card p-4"><label className="mb-2 block text-sm font-medium" htmlFor="marketing-event">Event</label><select id="marketing-event" value={selectedEventId} onChange={e => setEventId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-md">{events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
    {open && <div className="rounded-xl border border-border bg-card p-5 space-y-4"><h2 className="font-semibold">Create campaign</h2><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-2 block text-sm font-medium">Campaign name</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Opening-day reminder" maxLength={120} /></div><div><label className="mb-2 block text-sm font-medium">Audience</label><select value={audience} onChange={e => setAudience(e.target.value as WhatsAppCampaign["audience"])} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="CONFIRMED_REGISTRATIONS">Confirmed registrations</option><option value="TICKET_HOLDERS">Ticket holders</option></select></div></div><div><label className="mb-2 block text-sm font-medium">Message</label><textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={5} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Share an event update…" /><p className="mt-1 text-xs text-muted-foreground">{message.length}/2000</p></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={reset}>Cancel</Button><Button onClick={save} disabled={create.isPending || name.trim().length < 2 || !message.trim()}>{create.isPending ? "Saving…" : "Save draft"}</Button></div></div>}
    {campaigns.isLoading ? <LoadingState label="Loading campaigns..." /> : campaigns.isError ? <ErrorState title="Couldn't load campaigns" description="Please try again." onRetry={() => campaigns.refetch()} /> : campaigns.data?.campaigns.length ? <div className="rounded-xl border border-border bg-card overflow-hidden"><div className="border-b border-border px-4 py-3"><h2 className="font-semibold">Campaigns</h2></div><div className="divide-y divide-border">{campaigns.data.campaigns.map(c => <div key={c.id} className="p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{c.name}</h3><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{c.status}</span><span className="text-xs text-muted-foreground">{labels[c.audience]}</span></div><p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.message}</p><p className="mt-2 text-xs text-muted-foreground">{c.recipientCount} recipient(s) · {c.pendingCount} pending</p></div>{c.status === "DRAFT" && <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => doCancel(c)} disabled={cancel.isPending}><XCircle className="mr-2 h-4 w-4" />Cancel</Button><Button size="sm" onClick={() => doSend(c)} disabled={send.isPending}><Send className="mr-2 h-4 w-4" />Send</Button></div>}</div>)}</div></div> : <EmptyState icon={MessageCircle} title="No campaigns yet" description="Create a draft, review it, then queue it for opted-in recipients." />}
    <p className="text-xs text-muted-foreground">Only explicitly opted-in WhatsApp users are eligible. Campaigns are queued server-side and audited.</p>
  </div>;
}