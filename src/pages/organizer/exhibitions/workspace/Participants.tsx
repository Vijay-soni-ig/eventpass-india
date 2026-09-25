import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
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
  type ParticipantSort,
  useArchiveEventParticipant,
  useCreateEventParticipant,
  useEventModules,
  useEventParticipants,
  useRestoreEventParticipant,
  useSetEventModule,
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

const moduleForType: Record<ParticipantType, "PARTICIPANTS" | "SPEAKERS" | "SPONSORS" | "VENDORS"> = {
  PARTICIPANT: "PARTICIPANTS",
  SPEAKER: "SPEAKERS",
  SPONSOR: "SPONSORS",
  VENDOR: "VENDORS",
  PARTNER: "PARTNERS",
  STAFF: "PARTICIPANTS",
};

const moduleLabels = {
  PARTICIPANTS: "Participants",
  SPEAKERS: "Speakers",
  SPONSORS: "Sponsors",
  VENDORS: "Vendors",
  PARTNERS: "Partners",
} as const;

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
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

export interface ParticipantsProps {
  eventId?: string;
  canEdit?: boolean;
}

export default function Participants({ eventId: eventIdProp, canEdit: canEditProp }: ParticipantsProps = {}) {
  const workspaceContext = useOutletContext<EventWorkspaceContext | undefined>();
  const eventId = eventIdProp ?? workspaceContext?.exhibition.eventId;
  const canEdit = canEditProp ?? workspaceContext?.canEdit ?? false;
  const [type, setType] = useState<ParticipantType>("PARTICIPANT");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ARCHIVED">("ACTIVE");
  const [sortBy, setSortBy] = useState<ParticipantSort>("sortOrder");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EventParticipant | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const modules = useEventModules(eventId);
  const setModule = useSetEventModule(eventId);
  const enabledModules = useMemo(
    () => new Set((modules.data ?? []).filter((item) => item.enabled).map((item) => item.moduleType)),
    [modules.data],
  );
  const currentModule = moduleForType[type];
  const currentModuleEnabled = enabledModules.has(currentModule);

  useEffect(() => {
    setPage(1);
  }, [type, search, status, sortBy, sortDir]);

  const query = useEventParticipants(eventId, type, search, status, page, sortBy, sortDir, currentModuleEnabled);
  const create = useCreateEventParticipant(eventId, type);
  const update = useUpdateEventParticipant(eventId, type);
  const archive = useArchiveEventParticipant(eventId, type);
  const restore = useRestoreEventParticipant(eventId, type);

  const busy = create.isPending || update.isPending || setModule.isPending;
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)));

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
      status: item.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
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
        const { status: _status, ...createPayload } = payload;
        await create.mutateAsync(createPayload);
        toast.success(`${labels[type].replace("All ", "")} added`);
      }
      setShowForm(false);
      setEditing(null);
      setPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save participant");
    }
  };

  const toggleModule = (moduleType: keyof typeof moduleLabels) => {
    setModule.mutate(
      { moduleType, enabled: !enabledModules.has(moduleType) },
      {
        onSuccess: () => toast.success(`${moduleLabels[moduleType]} module ${enabledModules.has(moduleType) ? "disabled" : "enabled"}`),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update module"),
      },
    );
  };

  const title = useMemo(() => labels[type], [type]);

  if (!eventId) {
    return <EmptyState title="Participant module is not available" description="This exhibition is not linked to a Universal Event yet. Complete the Event foundation/backfill before managing participants." />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Event Participants</h2>
        <p className="text-sm text-muted-foreground">Manage speakers, sponsors, vendors, partners, staff, and custom participants from one event-scoped workspace.</p>
      </div>

      {canEdit && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3">
            <h3 className="font-semibold">Participant modules</h3>
            <p className="text-sm text-muted-foreground">Enable only the participant capabilities this event actually uses. Staff uses the shared Participants module; Partners uses the dedicated Partners module.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(moduleLabels) as Array<keyof typeof moduleLabels>).map((moduleType) => {
              const enabled = enabledModules.has(moduleType);
              return (
                <Button key={moduleType} type="button" variant={enabled ? "default" : "outline"} onClick={() => toggleModule(moduleType)} disabled={setModule.isPending} aria-pressed={enabled}>
                  {moduleLabels[moduleType]}: {enabled ? "Enabled" : "Disabled"}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto border-b">
          {PARTICIPANT_TYPES.map((item) => {
            const enabled = enabledModules.has(moduleForType[item]);
            return (
              <button
                key={item}
                type="button"
                disabled={!enabled}
                onClick={() => { setType(item); setEditing(null); setShowForm(false); }}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${type === item ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground"} ${!enabled ? "cursor-not-allowed opacity-40" : ""}`}
                aria-current={type === item ? "page" : undefined}
                title={!enabled ? `${moduleLabels[moduleForType[item]]} module is disabled` : undefined}
              >
                {labels[item]}
              </button>
            );
          })}
        </div>
        {canEdit && currentModuleEnabled && (
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add {type === "PARTICIPANT" ? "Participant" : type[0] + type.slice(1).toLowerCase()}</Button>
        )}
      </div>

      {!currentModuleEnabled ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h3 className="font-semibold">{moduleLabels[currentModule]} module is disabled</h3>
          <p className="mt-1 text-sm text-muted-foreground">Enable this module above before managing {title.toLowerCase()}.</p>
          {canEdit && <Button className="mt-4" onClick={() => toggleModule(currentModule)}>Enable {moduleLabels[currentModule]}</Button>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}...`} aria-label={`Search ${title}`} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Participant status">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as ParticipantSort)} className="h-10 rounded-md border border-input bg-background px-3 text-sm" aria-label="Sort participants">
              <option value="sortOrder">Display order</option>
              <option value="name">Name</option>
              <option value="organization">Organization</option>
              <option value="createdAt">Created date</option>
            </select>
            <Button type="button" variant="outline" onClick={() => setSortDir((value) => value === "asc" ? "desc" : "asc")} aria-label={`Sort direction: ${sortDir}`}>
              {sortDir === "asc" ? "Ascending" : "Descending"}
            </Button>
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
                {editing && (
                  <label className="flex items-center gap-2 text-sm" htmlFor="participant-record-status"><span>Status</span>
                    <select id="participant-record-status" aria-label="Participant record status" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as typeof form.status }))} className="h-9 rounded-md border border-input bg-background px-2">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </label>
                )}
              </div>
              <Button type="submit" disabled={busy}>{busy ? "Saving..." : editing ? "Save changes" : "Create"}</Button>
            </form>
          )}

          {query.isLoading ? <LoadingState label={`Loading ${title.toLowerCase()}...`} /> : query.isError ? (
            <ErrorState title={`Unable to load ${title.toLowerCase()}`} description={query.error instanceof Error ? query.error.message : "Request failed"} onRetry={() => query.refetch()} />
          ) : query.data?.items.length ? (
            <>
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
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-sm text-muted-foreground">Showing page {query.data.page} of {totalPages} · {query.data.total} total</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title={`No ${title.toLowerCase()} found`} description={search ? "Try a different search term." : `Add your first ${title.replace("All ", "").replace(/s$/, "").toLowerCase()} to this event.`} />
          )}
        </>
      )}
    </div>
  );
}

