import { useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOutletContext } from "react-router-dom";
import { toast } from "sonner";
import {
  PARTICIPANT_TYPES,
  type ParticipantType,
  type EventParticipant,
  useArchiveEventParticipant,
  useCreateEventParticipant,
  useEventParticipants,
  useRestoreEventParticipant,
  useUpdateEventParticipant,
} from "@/hooks/organizer/useEventParticipants";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

const labels: Record<ParticipantType, string> = {
  PARTICIPANT: "All Participants",
  SPEAKER: "Speakers",
  SPONSOR: "Sponsors",
  VENDOR: "Vendors",
  PARTNER: "Partners",
  STAFF: "Staff",
};

const apiType = (type: ParticipantType): ParticipantType => type;

const emptyForm = {
  name: "",
  title: "",
  organization: "",
  bio: "",
  email: "",
  phone: "",
  website: "",
  photoUrl: "",
  sortOrder: 0,
  isPublic: true,
};

export default function Participants() {
  const { exhibition, canEdit } = useOutletContext<EventWorkspaceContext>();
  const [type, setType] = useState<ParticipantType>("PARTICIPANT");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ARCHIVED">("ACTIVE");
  const [editing, setEditing] = useState<EventParticipant | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  // Every Exhibition is linked to a Universal Event. The API exposes eventId
  // on the organizer exhibition response for this workspace.
  const eventId = exhibition.eventId;
  const query = useEventParticipants(eventId, type, search, status);
  const create = useCreateEventParticipant(eventId, apiType(type));
  const update = useUpdateEventParticipant(eventId, apiType(type));
  const archive = useArchiveEventParticipant(eventId, apiType(type));
  const restore = useRestoreEventParticipant(eventId, apiType(type));

  const canUseModule = Boolean(eventId);
  const busy = create.isPending || update.isPending;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (item: EventParticipant) => {
    setEditing(item);
    setForm({
      name: item.name,
      title: item.title ?? "",
      organization: item.organization ?? "",
      bio: item.bio ?? "",
      email: item.email ?? "",
      phone: item.phone ?? "",
      website: item.website ?? "",
      photoUrl: item.photoUrl ?? "",
      sortOrder: item.sortOrder,
      isPublic: item.isPublic,
    });
    setShowForm(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        title: form.title.trim() || undefined,
        organization: form.organization.trim() || undefined,
        bio: form.bio.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        photoUrl: form.photoUrl.trim() || undefined,
      };
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: payload });
        toast.success(`${labels[type].replace("All ", "")} updated`);
      } else {
        await create.mutateAsync(payload);
        toast.success(`${labels[type].replace("All ", "")} added`);
      }
      setShowForm(false);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save participant");
    }
  };

  const title = useMemo(() => labels[type], [type]);

  if (!canUseModule) {
    return (
      <EmptyState
        title="Participant module is not available"
        description="This exhibition is not linked to a Universal Event yet. Run the event backfill before managing participants."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Event Participants</h2>
          <p className="text-sm text-muted-foreground">Manage speakers, sponsors, vendors, partners, staff, and custom participants for this event.</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add {type === "PARTICIPANT" ? "Participant" : type[0] + type.slice(1).toLowerCase()}</Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b">
        {PARTICIPANT_TYPES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => { setType(item); setEditing(null); setShowForm(false); }}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${type === item ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"}`}
            aria-current={type === item ? "page" : undefined}
          >
            {labels[item]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}...`} aria-label={`Search ${title}`} />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Participant status"
        >
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {showForm && canEdit && (
        <form onSubmit={save} className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editing ? `Edit ${title.replace("All ", "")}` : `Add ${title.replace("All ", "").replace(/s$/, "")}`}</h3>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([
              ["name", "Name"],
              ["title", "Title / Role"],
              ["organization", "Organization"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["website", "Website"],
              ["photoUrl", "Photo URL"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-medium" htmlFor={`participant-${key}`}>{label}</label>
                <Input id={`participant-${key}`} value={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} type={key === "email" ? "email" : "text"} />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="participant-bio">Bio / Description</label>
            <Textarea id="participant-bio" value={form.bio} onChange={(e) => setForm((current) => ({ ...current, bio: e.target.value }))} rows={4} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((current) => ({ ...current, isPublic: e.target.checked }))} /> Public on event page</label>
            <label className="flex items-center gap-2 text-sm"><span>Sort order</span><Input className="w-24" type="number" min={0} max={100000} value={form.sortOrder} onChange={(e) => setForm((current) => ({ ...current, sortOrder: Number(e.target.value) }))} /></label>
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create"}</Button>
        </form>
      )}

      {query.isLoading ? <LoadingState label={`Loading ${title.toLowerCase()}...`} /> : query.isError ? (
        <ErrorState title={`Unable to load ${title.toLowerCase()}`} description={query.error instanceof Error ? query.error.message : "Request failed"} onRetry={() => query.refetch()} />
      ) : query.data?.items.length ? (
        <div className="grid gap-3">
          {query.data.items.map((item) => (
            <div key={item.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{item.name}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{item.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{[item.title, item.organization].filter(Boolean).join(" · ") || "No role or organization"}</p>
                  {item.email && <p className="text-sm mt-1">{item.email}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    {item.status === "ARCHIVED" ? (
                      <Button size="sm" variant="outline" onClick={() => restore.mutate(item.id, { onSuccess: () => toast.success("Restored"), onError: (e) => toast.error(e instanceof Error ? e.message : "Restore failed") })} disabled={restore.isPending}><RotateCcw className="mr-1 h-4 w-4" />Restore</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => archive.mutate(item.id, { onSuccess: () => toast.success("Archived"), onError: (e) => toast.error(e instanceof Error ? e.message : "Archive failed") })} disabled={archive.isPending}><Trash2 className="mr-1 h-4 w-4" />Archive</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={`No ${title.toLowerCase()} found`} description={search ? "Try a different search term." : `Add your first ${title.replace("All ", "").replace(/s$/, "").toLowerCase()} to this event.`} />
      )}
    </div>
  );
}
