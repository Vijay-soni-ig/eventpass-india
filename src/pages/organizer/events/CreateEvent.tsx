import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Calendar, Check, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useCreateEvent, type EventType } from "@/hooks/useEvents";
import { useOrganizerEventCategories } from "@/hooks/platform/usePlatformAdmin";

const EVENT_TYPES: Array<{ value: Exclude<EventType, "EXHIBITION">; label: string; description: string; icon: typeof Calendar }> = [
  { value: "CONFERENCE", label: "Conference", description: "Multi-session professional or industry event.", icon: Users },
  { value: "WORKSHOP", label: "Workshop", description: "Hands-on learning or training experience.", icon: Ticket },
  { value: "SEMINAR", label: "Seminar", description: "Talks, presentations, and knowledge sharing.", icon: Calendar },
  { value: "CONCERT", label: "Concert", description: "Live music and performance events.", icon: Calendar },
  { value: "FESTIVAL", label: "Festival", description: "Public celebrations and multi-activity events.", icon: Calendar },
  { value: "SPORTS", label: "Sports", description: "Matches, tournaments, and sporting events.", icon: Users },
  { value: "COMMUNITY", label: "Community", description: "Local, social, and community-led events.", icon: Users },
  { value: "OTHER", label: "Other", description: "An event that does not fit another type.", icon: Calendar },
];

export default function CreateEvent() {
  const navigate = useNavigate(); const createEvent = useCreateEvent();
  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesError } = useOrganizerEventCategories();
  const [step, setStep] = useState<"type" | "details">("type");
  const [eventType, setEventType] = useState<Exclude<EventType, "EXHIBITION"> | null>(null);
  const [form, setForm] = useState({ title: "", description: "", categoryId: "", city: "", venue: "", startDate: "", endDate: "", visibility: "public" as "public" | "private" });

  const chooseType = (type: Exclude<EventType, "EXHIBITION">) => { setEventType(type); setStep("details"); };
  const submit = () => {
    if (!eventType) return;
    if (!form.title.trim() || !form.city.trim() || !form.venue.trim() || !form.startDate || !form.endDate) { toast.error("Please complete the required fields"); return; }
    if (form.endDate < form.startDate) { toast.error("End date cannot be before start date"); return; }
    createEvent.mutate({ eventType, title: form.title.trim(), description: form.description.trim() || undefined, categoryId: form.categoryId || undefined,
      city: form.city.trim(), venue: form.venue.trim(), startDate: form.startDate, endDate: form.endDate, visibility: form.visibility, status: "DRAFT" }, {
      onSuccess: () => { toast.success("Event created as a draft"); navigate("/organizer/events"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create event"),
    });
  };

  return <div className="mx-auto max-w-4xl space-y-6 animate-slide-up">
    <div className="flex items-center gap-4"><Button variant="ghost" size="icon" onClick={() => navigate("/organizer/events")} aria-label="Back to events"><ArrowLeft className="h-5 w-5" /></Button>
      <div><h1 className="text-2xl font-semibold">Create Event</h1><p className="text-muted-foreground">Choose a type, then add the shared event details.</p></div>
    </div>
    {step === "type" ? <div className="space-y-5">
      <div><h2 className="text-lg font-semibold">What are you organizing?</h2><p className="text-sm text-muted-foreground">Choose the event type. Exhibitions continue through the existing Exhibition workflow.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => navigate("/organizer/exhibitions/new")} className="rounded-xl border border-primary/40 bg-primary/5 p-5 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary">
          <Calendar className="mb-3 h-6 w-6 text-primary" /><h3 className="font-semibold">Exhibition</h3><p className="mt-1 text-sm text-muted-foreground">Stalls, exhibitors, floor plans, tickets, and check-in.</p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-primary">Use Exhibition workflow <ArrowRight className="ml-1 h-4 w-4" /></span>
        </button>
        {EVENT_TYPES.map((type) => { const Icon = type.icon; return <button key={type.value} type="button" onClick={() => chooseType(type.value)}
          className="rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary">
          <Icon className="mb-3 h-6 w-6 text-primary" /><h3 className="font-semibold">{type.label}</h3><p className="mt-1 text-sm text-muted-foreground">{type.description}</p></button>; })}
      </div>
    </div> : <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event type</p>
        <h2 className="text-lg font-semibold">{EVENT_TYPES.find((type) => type.value === eventType)?.label}</h2></div>
        <Button variant="outline" onClick={() => setStep("type")}><ArrowLeft className="mr-2 h-4 w-4" />Change type</Button></div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label>Event title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ahmedabad Tech Summit 2026" /></div>
        <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe what visitors can expect..." /></div>
        <div className="space-y-2"><Label>Category</Label>{categoriesError && <p className="text-xs text-destructive">Could not load categories. You can continue without a category.</p>}<Select value={form.categoryId} onValueChange={(value) => setForm({ ...form, categoryId: value })}><SelectTrigger><SelectValue placeholder={categoriesLoading ? "Loading categories..." : "Select category"} /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Visibility</Label><Select value={form.visibility} onValueChange={(value: "public" | "private") => setForm({ ...form, visibility: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>City *</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ahmedabad" /></div>
        <div className="space-y-2"><Label>Venue *</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Venue name and address" /></div>
        <div className="space-y-2"><Label>Start date *</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
        <div className="space-y-2"><Label>End date *</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
      </div>
      <div className="flex justify-between gap-3 border-t pt-5"><Button variant="outline" onClick={() => setStep("type")}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
        <Button onClick={submit} disabled={createEvent.isPending}>{createEvent.isPending ? "Creating..." : "Create Draft Event"} <Check className="ml-2 h-4 w-4" /></Button></div>
    </div>}
  </div>;
}
