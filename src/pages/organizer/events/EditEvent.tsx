import { useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "sonner";
import { useEvent, useUpdateEvent, type EventStatus } from "@/hooks/useEvents";
import { useOrganizerEventCategories } from "@/hooks/platform/usePlatformAdmin";
import EventModuleConfiguration from "@/components/events/EventModuleConfiguration";

const STATUSES: Array<{ value: EventStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const updateEvent = useUpdateEvent();
  const { data: categories = [], isLoading: categoriesLoading } = useOrganizerEventCategories();
  const [form, setForm] = useState({
    title: "", description: "", categoryId: "", city: "", venue: "",
    startDate: "", endDate: "", visibility: "public" as "public" | "private",
    status: "DRAFT" as EventStatus, coverImageUrl: "", refundPolicy: "", terms: "",
  });

  useEffect(() => {
    if (!event) return;
    setForm({
      title: event.title ?? "",
      description: event.description ?? "",
      categoryId: event.category?.id ?? "",
      city: event.city ?? "",
      venue: event.venue ?? "",
      startDate: dateInput(event.startDate),
      endDate: dateInput(event.endDate),
      visibility: event.visibility ?? "public",
      status: event.status,
      coverImageUrl: event.coverImageUrl ?? "",
      refundPolicy: event.refundPolicy ?? "",
      terms: event.terms ?? "",
    });
  }, [event]);

  if (isLoading) return <LoadingState label="Loading event..." />;
  if (isError || !event) return <ErrorState title="Event not found" description="This event could not be loaded." onRetry={() => refetch()} />;
  if (event.exhibition) {
    return <div className="mx-auto max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-semibold">Exhibition event</h1><p className="text-muted-foreground">This event is linked to the legacy Exhibition workflow, which remains the source of truth for its shared fields.</p></div>
      <Button asChild><Link to={`/organizer/exhibitions/${event.exhibition.id}`}>Open Exhibition <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
    </div>;
  }

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!form.title.trim() || !form.city.trim() || !form.venue.trim() || !form.startDate || !form.endDate) {
      toast.error("Title, city, venue, start date and end date are required");
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("End date cannot be before start date");
      return;
    }
    updateEvent.mutate({
      id: event.id,
      data: {
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        status: form.status,
        visibility: form.visibility,
        city: form.city.trim(),
        venue: form.venue.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        coverImageUrl: form.coverImageUrl.trim(),
        refundPolicy: form.refundPolicy.trim(),
        terms: form.terms.trim(),
      },
    }, {
      onSuccess: () => { toast.success("Event updated"); navigate("/organizer/events"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update event"),
    });
  };

  return <div className="mx-auto max-w-4xl space-y-6 animate-slide-up">
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => navigate("/organizer/events")} aria-label="Back to events"><ArrowLeft className="h-5 w-5" /></Button>
      <div><h1 className="text-2xl font-semibold">Edit Event</h1><p className="text-muted-foreground">Update the event details and lifecycle state.</p></div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><Link to={`/organizer/events/${event.id}/participants`}>Manage Participants <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
    </div>
    <EventModuleConfiguration eventId={event.id} />
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm"><span className="font-medium">{event.eventType}</span> · Event ID {event.id}</div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2"><Label>Event title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={5000} /></div>
        <div className="space-y-2"><Label>Category</Label><Select value={form.categoryId || "none"} onValueChange={(v) => set("categoryId", v === "none" ? "" : v)}><SelectTrigger><SelectValue placeholder={categoriesLoading ? "Loading categories..." : "Select category"} /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => set("status", v as EventStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Visibility</Label><Select value={form.visibility} onValueChange={(v) => set("visibility", v as "public" | "private")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={100} /></div>
        <div className="space-y-2"><Label>Venue *</Label><Input value={form.venue} onChange={(e) => set("venue", e.target.value)} maxLength={200} /></div>
        <div className="space-y-2"><Label>Start date *</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div className="space-y-2"><Label>End date *</Label><Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Cover image URL</Label><Input value={form.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Refund policy</Label><Textarea value={form.refundPolicy} onChange={(e) => set("refundPolicy", e.target.value)} rows={3} /></div>
        <div className="space-y-2 md:col-span-2"><Label>Terms</Label><Textarea value={form.terms} onChange={(e) => set("terms", e.target.value)} rows={3} /></div>
      </div>
      <div className="flex justify-between gap-3 border-t pt-5">
        <Button variant="outline" onClick={() => navigate("/organizer/events")}>Cancel</Button>
        <Button onClick={submit} disabled={updateEvent.isPending}>{updateEvent.isPending ? "Saving..." : "Save changes"} <Check className="ml-2 h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}
