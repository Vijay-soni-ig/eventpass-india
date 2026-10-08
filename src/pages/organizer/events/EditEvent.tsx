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
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import { useEvent, useEventModules, useUpdateEvent, type EventStatus } from "@/hooks/useEvents";
import { useUpdateExhibition } from "@/hooks/exhibitor/useExhibitions";
import EventCategorySelector from "@/components/events/EventCategorySelector";
import EventModuleConfiguration from "@/components/events/EventModuleConfiguration";

const STATUSES: Array<{ value: EventStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const EXHIBITION_STATUS: Record<"DRAFT" | "PUBLISHED" | "PAUSED" | "COMPLETED", "draft" | "live" | "paused" | "completed"> = {
  DRAFT: "draft",
  PUBLISHED: "live",
  PAUSED: "paused",
  COMPLETED: "completed",
};

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUpdate = hasOrganizerPermission(user?.roles, "event:update");
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const { data: modules = [] } = useEventModules(id);
  const updateEvent = useUpdateEvent();
  const updateExhibition = useUpdateExhibition();

  const participantsEnabled = modules.some((module) =>
    module.enabled && ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS"].includes(module.moduleType)
  );

  const [form, setForm] = useState({
    title: "", description: "", categoryId: "", city: "", venue: "",
    latitude: "", longitude: "", startDate: "", endDate: "", visibility: "public" as "public" | "private",
    status: "DRAFT" as EventStatus, coverImageUrl: "", seoTitle: "", seoDescription: "", seoImageUrl: "",
    refundPolicy: "", terms: "",
  });

  useEffect(() => {
    if (!event) return;
    setForm({
      title: event.title ?? "",
      description: event.description ?? "",
      categoryId: event.category?.id ?? "",
      city: event.city ?? "",
      venue: event.venue ?? "",
      latitude: event.latitude != null ? String(event.latitude) : "",
      longitude: event.longitude != null ? String(event.longitude) : "",
      startDate: dateInput(event.startDate),
      endDate: dateInput(event.endDate),
      visibility: event.visibility ?? "public",
      status: event.status,
      coverImageUrl: event.coverImageUrl ?? "",
      seoTitle: event.seoTitle ?? "",
      seoDescription: event.seoDescription ?? "",
      seoImageUrl: event.seoImageUrl ?? "",
      refundPolicy: event.refundPolicy ?? "",
      terms: event.terms ?? "",
    });
  }, [event]);

  if (isLoading) return <LoadingState label="Loading event..." />;
  if (isError || !event) return <ErrorState title="Event not found" description="This event could not be loaded." onRetry={() => refetch()} />;

  const linkedExhibition = event.exhibition;
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.title.trim() || !form.city.trim() || !form.venue.trim() || !form.startDate || !form.endDate) {
      toast.error("Title, city, venue, start date and end date are required");
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("End date cannot be before start date");
      return;
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (form.latitude.trim() || form.longitude.trim()) {
      latitude = Number(form.latitude);
      longitude = Number(form.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        toast.error("Latitude must be a number between -90 and 90");
        return;
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        toast.error("Longitude must be a number between -180 and 180");
        return;
      }
    }

    if (linkedExhibition) {
      if (form.status === "CANCELLED") {
        toast.error("Exhibition events do not support the Cancelled status yet. Use the Exhibition operational workflow for cancellation.");
        return;
      }

      try {
        await updateExhibition.mutateAsync({
          id: linkedExhibition.id,
          name: form.title.trim(),
          description: form.description.trim(),
          category: event.category?.name ?? undefined,
          city: form.city.trim(),
          venue: form.venue.trim(),
          latitude,
          longitude,
          startDate: form.startDate,
          endDate: form.endDate,
          status: EXHIBITION_STATUS[form.status as keyof typeof EXHIBITION_STATUS],
          visibility: form.visibility,
          refundPolicy: form.refundPolicy.trim(),
          terms: form.terms.trim(),
        });

        toast.success("Exhibition event details updated");
        navigate(`/organizer/events/${event.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update exhibition event");
      }
      return;
    }

    updateEvent.mutate({
      id: event.id,
      data: {
        title: form.title.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        ...(form.status !== event.status ? { status: form.status } : {}),
        visibility: form.visibility,
        city: form.city.trim(),
        venue: form.venue.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        coverImageUrl: form.coverImageUrl.trim(),
        seoTitle: form.seoTitle.trim(),
        seoDescription: form.seoDescription.trim(),
        seoImageUrl: form.seoImageUrl.trim(),
        refundPolicy: form.refundPolicy.trim(),
        terms: form.terms.trim(),
      },
    }, {
      onSuccess: () => { toast.success("Event updated"); navigate("/organizer/events"); },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to update event"),
    });
  };

  const saving = updateEvent.isPending || updateExhibition.isPending;

  return <div className="mx-auto max-w-4xl space-y-6 animate-slide-up">
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon" onClick={() => navigate(`/organizer/events/${event.id}`)} aria-label="Back to event"><ArrowLeft className="h-5 w-5" /></Button>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <p className="text-muted-foreground">Update the event details and lifecycle state.</p>
      </div>
    </div>

    {linkedExhibition && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <p className="font-medium">Exhibition event</p>
      <p className="mt-1 text-muted-foreground">
        Core event details are now editable from this Universal Event workspace. Exhibition-specific operational content such as floor plans, stalls, exhibitor applications and public content remains in the compatibility tools while those modules are being migrated.
      </p>
      <Button asChild variant="link" className="px-0">
        <Link to={`/organizer/exhibitions/${linkedExhibition.id}`}>Open Exhibition tools <ExternalLink className="ml-2 h-4 w-4" /></Link>
      </Button>
    </div>}

    {participantsEnabled && <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><Link to={`/organizer/events/${event.id}/participants`}>Manage Participants <ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
    </div>}

    <EventModuleConfiguration eventId={event.id} />

    {!canUpdate && <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      You have view-only access to this event. Event changes require event update permission.
    </div>}

    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <fieldset disabled={!canUpdate} className="contents">
        <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">{event.eventType}</span> · Event ID {event.id}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>Event title *</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={5000} /></div>
          <div className="space-y-2"><Label>Category</Label>
            {linkedExhibition
              ? <Input value={event.category?.name ?? ""} disabled aria-label="Exhibition category" />
              : <EventCategorySelector value={form.categoryId} onChange={(v) => set("categoryId", v)} allowNone placeholder="Search and select category" />}
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as EventStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(linkedExhibition ? STATUSES.filter((status) => status.value !== "CANCELLED") : (event.status === "PUBLISHED" ? [{ value: "PUBLISHED" as EventStatus, label: "Published" }, ...STATUSES] : STATUSES)).map((status) =>
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Visibility</Label><Select value={form.visibility} onValueChange={(v) => set("visibility", v as "public" | "private")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", v => v)} /></div>
          <div className="space-y-2"><Label>Venue *</Label><Input value={form.venue} onChange={(e) => set("venue", e.target.value)} maxLength={200} /></div>
          <div className="space-y-2"><Label>Venue Latitude (Optional)</Label><Input value={form.latitude} onChange={(e) => set("latitude", e.target.value)} inputMode="decimal" placeholder="e.g. 19.0760" /></div>
          <div className="space-y-2"><Label>Venue Longitude (Optional)</Label><Input value={form.longitude} onChange={(e) => set("longitude", e.target.value)} inputMode="decimal" placeholder="e.g. 72.8777" /></div>
          <div className="space-y-2"><Label>Start date *</Label><Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
          <div className="space-y-2"><Label>End date *</Label><Input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} /></div>

          {!linkedExhibition && <div className="space-y-2 md:col-span-2"><Label>Cover image URL</Label><Input value={form.coverImageUrl} onChange={(e) => set("coverImageUrl", e.target.value)} /></div>}

          {!linkedExhibition && <div className="md:col-span-2 rounded-xl border bg-muted/30 p-4 space-y-4">
            <div><h2 className="font-semibold">SEO settings</h2><p className="text-sm text-muted-foreground">Optional metadata for the public event page. Leave blank to use the event title, description and cover image.</p></div>
            <div className="space-y-2"><Label>SEO title</Label><Input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} placeholder={form.title || "Event title"} /><p className="text-xs text-muted-foreground">{form.seoTitle.length}/70 characters</p></div>
            <div className="space-y-2"><Label>SEO description</Label><Textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={160} rows={3} placeholder={form.description || "Event description"} /><p className="text-xs text-muted-foreground">{form.seoDescription.length}/160 characters</p></div>
            <div className="space-y-2"><Label>SEO image URL</Label><Input value={form.seoImageUrl} onChange={(e) => set("seoImageUrl", e.target.value)} placeholder={form.coverImageUrl || "https://..."} /></div>
          </div>}

          <div className="space-y-2 md:col-span-2"><Label>Refund policy</Label><Textarea value={form.refundPolicy} onChange={(e) => set("refundPolicy", e.target.value)} rows={3} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Terms</Label><Textarea value={form.terms} onChange={(e) => set("terms", e.target.value)} rows={3} /></div>
        </div>
      </fieldset>

      <div className="flex justify-between gap-3 border-t pt-5">
        <Button variant="outline" onClick={() => navigate(`/organizer/events/${event.id}`)}>Cancel</Button>
        {canUpdate ? <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save changes"} <Check className="ml-2 h-4 w-4" /></Button> : <span className="self-center text-sm text-muted-foreground">View only</span>}
      </div>
    </div>
  </div>;
}
