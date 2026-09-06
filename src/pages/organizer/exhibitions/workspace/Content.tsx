import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, ChevronUp, ChevronDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  faqHooks, highlightHooks, audienceHooks, scheduleHooks, mediaHooks,
  type ExhibitionFAQ, type ExhibitionHighlight, type ExhibitionAudience, type ExhibitionSchedule, type ExhibitionMedia,
} from "@/hooks/exhibitor/useExhibitionContent";
import type { EventWorkspaceContext } from "@/components/organizer/exhibitions/EventWorkspaceLayout";

const HIGHLIGHT_ICON_OPTIONS = ["users", "store", "mic", "handshake", "award", "zap", "calendar", "ticket", "shield-check", "building2"];

// Shared row shell — every content type gets identical reorder/active/edit
// affordances so an organizer only has to learn this pattern once. "Delete"
// and "deactivate" are deliberately the SAME action here (see
// useExhibitionContent.ts / routes/exhibitionContent.ts's own comment on
// why these five entities use one simple `active` flag rather than a
// separate archive concept) — the Switch below IS the delete/restore
// control, nothing is ever hard-removed.
function ContentRow({
  active, isFirst, isLast, onMoveUp, onMoveDown, onToggleActive, onEdit, children,
}: {
  active: boolean; isFirst: boolean; isLast: boolean;
  onMoveUp: () => void; onMoveDown: () => void; onToggleActive: (v: boolean) => void; onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${active ? "border-border" : "border-border/50 bg-muted/30 opacity-70"}`}>
      <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
        <button type="button" onClick={onMoveUp} disabled={isFirst} aria-label="Move up" className="disabled:opacity-30 hover:text-primary">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast} aria-label="Move down" className="disabled:opacity-30 hover:text-primary">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>{children}</div>
      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Label className="text-xs text-muted-foreground">{active ? "Active" : "Hidden"}</Label>
        <Switch checked={active} onCheckedChange={onToggleActive} aria-label={active ? "Hide from public page" : "Show on public page"} />
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}

function reorderPayload(items: { id: string }[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((item, idx) => ({ id: item.id, sortOrder: idx }));
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------
function FAQSection({ exhibitionId, canEdit }: { exhibitionId: string; canEdit: boolean }) {
  const { data: items = [], isLoading } = faqHooks.useList(exhibitionId);
  const create = faqHooks.useCreate(exhibitionId);
  const update = faqHooks.useUpdate(exhibitionId);
  const reorder = faqHooks.useReorder(exhibitionId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ question: "", answer: "" });

  const startEdit = (item: ExhibitionFAQ) => {
    setEditingId(item.id);
    setForm({ question: item.question, answer: item.answer });
    setAdding(false);
  };

  const submit = () => {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error("Question and answer are both required");
      return;
    }
    if (editingId) {
      update.mutate({ id: editingId, question: form.question, answer: form.answer }, {
        onSuccess: () => { toast.success("FAQ saved"); setEditingId(null); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      });
    } else {
      create.mutate({ question: form.question, answer: form.answer }, {
        onSuccess: () => { toast.success("FAQ added"); setAdding(false); setForm({ question: "", answer: "" }); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add FAQ"),
      });
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const payload = reorderPayload(items, idx, idx + dir);
    reorder.mutate(payload, { onError: () => toast.error("Reorder failed") });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-lg">Frequently Asked Questions</h2>
          <p className="text-sm text-muted-foreground">Answer what visitors commonly ask before they book.</p>
        </div>
        {canEdit && !adding && !editingId && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAdding(true); setForm({ question: "", answer: "" }); }}>
            <Plus className="w-4 h-4" /> Add FAQ
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : items.length === 0 && !adding ? (
        <EmptyHint>No FAQs added yet.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                <Input value={form.question} maxLength={200} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="Question" />
                <Textarea value={form.answer} maxLength={2000} rows={2} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submit} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <ContentRow
                key={item.id}
                active={item.active}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onToggleActive={(v) => update.mutate({ id: item.id, active: v })}
                onEdit={() => canEdit && startEdit(item)}
              >
                <p className="font-medium text-sm">{item.question}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{item.answer}</p>
              </ContentRow>
            )
          )}
        </div>
      )}

      {adding && (
        <div className="mt-3 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
          <Input value={form.question} maxLength={200} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="e.g. Is parking available?" autoFocus />
          <Textarea value={form.answer} maxLength={2000} rows={2} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="Answer" />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending}>{create.isPending ? "Adding..." : "Add FAQ"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// HIGHLIGHTS ("What to Expect")
// ---------------------------------------------------------------------------
function HighlightsSection({ exhibitionId, canEdit }: { exhibitionId: string; canEdit: boolean }) {
  const { data: items = [], isLoading } = highlightHooks.useList(exhibitionId);
  const create = highlightHooks.useCreate(exhibitionId);
  const update = highlightHooks.useUpdate(exhibitionId);
  const reorder = highlightHooks.useReorder(exhibitionId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", iconKey: "" });

  const startEdit = (item: ExhibitionHighlight) => {
    setEditingId(item.id);
    setForm({ title: item.title, description: item.description ?? "", iconKey: item.iconKey ?? "" });
    setAdding(false);
  };

  const submit = () => {
    if (!form.title.trim()) return toast.error("Title is required");
    const data = { title: form.title, description: form.description || undefined, iconKey: form.iconKey || undefined };
    if (editingId) {
      update.mutate({ id: editingId, ...data }, {
        onSuccess: () => { toast.success("Highlight saved"); setEditingId(null); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      });
    } else {
      create.mutate(data, {
        onSuccess: () => { toast.success("Highlight added"); setAdding(false); setForm({ title: "", description: "", iconKey: "" }); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add — you may have reached the 8-highlight limit"),
      });
    }
  };

  const move = (idx: number, dir: -1 | 1) => reorder.mutate(reorderPayload(items, idx, idx + dir), { onError: () => toast.error("Reorder failed") });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-lg">What to Expect</h2>
          <p className="text-sm text-muted-foreground">What will visitors experience at this exhibition? (up to 8)</p>
        </div>
        {canEdit && !adding && !editingId && items.length < 8 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAdding(true); setForm({ title: "", description: "", iconKey: "" }); }}>
            <Plus className="w-4 h-4" /> Add Highlight
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 && !adding ? (
        <EmptyHint>No highlights added yet.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                <Input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
                <Textarea value={form.description} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
                <Select value={form.iconKey || "none"} onValueChange={(v) => setForm({ ...form, iconKey: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Icon (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No icon</SelectItem>
                    {HIGHLIGHT_ICON_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={submit} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <ContentRow
                key={item.id}
                active={item.active}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onToggleActive={(v) => update.mutate({ id: item.id, active: v })}
                onEdit={() => canEdit && startEdit(item)}
              >
                <p className="font-medium text-sm">{item.title}</p>
                {item.description && <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>}
              </ContentRow>
            )
          )}
        </div>
      )}

      {adding && (
        <div className="mt-3 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
          <Input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Live Product Demonstrations" autoFocus />
          <Textarea value={form.description} maxLength={300} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description (optional)" />
          <Select value={form.iconKey || "none"} onValueChange={(v) => setForm({ ...form, iconKey: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Icon (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No icon</SelectItem>
              {HIGHLIGHT_ICON_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending}>{create.isPending ? "Adding..." : "Add Highlight"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AUDIENCE ("Who Should Attend")
// ---------------------------------------------------------------------------
function AudienceSection({ exhibitionId, canEdit }: { exhibitionId: string; canEdit: boolean }) {
  const { data: items = [], isLoading } = audienceHooks.useList(exhibitionId);
  const create = audienceHooks.useCreate(exhibitionId);
  const update = audienceHooks.useUpdate(exhibitionId);
  const reorder = audienceHooks.useReorder(exhibitionId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const startEdit = (item: ExhibitionAudience) => {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description ?? "" });
    setAdding(false);
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const data = { name: form.name, description: form.description || undefined };
    if (editingId) {
      update.mutate({ id: editingId, ...data }, {
        onSuccess: () => { toast.success("Saved"); setEditingId(null); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      });
    } else {
      create.mutate(data, {
        onSuccess: () => { toast.success("Added"); setAdding(false); setForm({ name: "", description: "" }); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add — you may have reached the 10-entry limit"),
      });
    }
  };

  const move = (idx: number, dir: -1 | 1) => reorder.mutate(reorderPayload(items, idx, idx + dir), { onError: () => toast.error("Reorder failed") });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-lg">Who Should Attend</h2>
          <p className="text-sm text-muted-foreground">Who is this exhibition most useful for? (up to 10)</p>
        </div>
        {canEdit && !adding && !editingId && items.length < 10 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAdding(true); setForm({ name: "", description: "" }); }}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : items.length === 0 && !adding ? (
        <EmptyHint>No audience segments added yet.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                <Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Healthcare Professionals" />
                <Input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description (optional)" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submit} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <ContentRow
                key={item.id}
                active={item.active}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onToggleActive={(v) => update.mutate({ id: item.id, active: v })}
                onEdit={() => canEdit && startEdit(item)}
              >
                <p className="font-medium text-sm">{item.name}</p>
                {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
              </ContentRow>
            )
          )}
        </div>
      )}

      {adding && (
        <div className="mt-3 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
          <Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Healthcare Professionals" autoFocus />
          <Input value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description (optional)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending}>{create.isPending ? "Adding..." : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SCHEDULE
// ---------------------------------------------------------------------------
function ScheduleSection({ exhibitionId, canEdit }: { exhibitionId: string; canEdit: boolean }) {
  const { data: items = [], isLoading } = scheduleHooks.useList(exhibitionId);
  const create = scheduleHooks.useCreate(exhibitionId);
  const update = scheduleHooks.useUpdate(exhibitionId);
  const reorder = scheduleHooks.useReorder(exhibitionId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", startTime: "", endTime: "", title: "", description: "" });

  const startEdit = (item: ExhibitionSchedule) => {
    setEditingId(item.id);
    setForm({ date: item.date.slice(0, 10), startTime: item.startTime ?? "", endTime: item.endTime ?? "", title: item.title, description: item.description ?? "" });
    setAdding(false);
  };

  const submit = () => {
    if (!form.date || !form.title.trim()) return toast.error("Date and title are required");
    const data = {
      date: form.date, title: form.title,
      startTime: form.startTime || undefined, endTime: form.endTime || undefined, description: form.description || undefined,
    };
    if (editingId) {
      update.mutate({ id: editingId, ...data }, {
        onSuccess: () => { toast.success("Saved"); setEditingId(null); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
      });
    } else {
      create.mutate(data, {
        onSuccess: () => { toast.success("Schedule entry added"); setAdding(false); setForm({ date: "", startTime: "", endTime: "", title: "", description: "" }); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add schedule entry"),
      });
    }
  };

  const move = (idx: number, dir: -1 | 1) => reorder.mutate(reorderPayload(items, idx, idx + dir), { onError: () => toast.error("Reorder failed") });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-lg">Dates &amp; Schedule</h2>
          <p className="text-sm text-muted-foreground">Optional — add this only if you have specific daily timings.</p>
        </div>
        {canEdit && !adding && !editingId && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAdding(true); setForm({ date: "", startTime: "", endTime: "", title: "", description: "" }); }}>
            <Plus className="w-4 h-4" /> Add Day
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 && !adding ? (
        <EmptyHint>No schedule added yet — visitors will just see the exhibition's overall dates.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) =>
            editingId === item.id ? (
              <div key={item.id} className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  <Input value={form.startTime} maxLength={30} placeholder="Start (e.g. 10:00 AM)" onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  <Input value={form.endTime} maxLength={30} placeholder="End (e.g. 6:00 PM)" onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
                <Input value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. Main Exhibition Day" />
                <Textarea value={form.description} maxLength={1000} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={submit} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <ContentRow
                key={item.id}
                active={item.active}
                isFirst={idx === 0}
                isLast={idx === items.length - 1}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onToggleActive={(v) => update.mutate({ id: item.id, active: v })}
                onEdit={() => canEdit && startEdit(item)}
              >
                <p className="text-xs text-muted-foreground">
                  {new Date(item.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {(item.startTime || item.endTime) && ` · ${item.startTime ?? ""}${item.startTime && item.endTime ? " – " : ""}${item.endTime ?? ""}`}
                </p>
                <p className="font-medium text-sm">{item.title}</p>
              </ContentRow>
            )
          )}
        </div>
      )}

      {adding && (
        <div className="mt-3 p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} autoFocus />
            <Input value={form.startTime} maxLength={30} placeholder="Start (e.g. 10:00 AM)" onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            <Input value={form.endTime} maxLength={30} placeholder="End (e.g. 6:00 PM)" onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </div>
          <Input value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title, e.g. Main Exhibition Day" />
          <Textarea value={form.description} maxLength={1000} rows={2} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={create.isPending}>{create.isPending ? "Adding..." : "Add Day"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// MEDIA (gallery)
// ---------------------------------------------------------------------------
function MediaSection({ exhibitionId, canEdit }: { exhibitionId: string; canEdit: boolean }) {
  const { data: items = [], isLoading } = mediaHooks.useList(exhibitionId);
  const upload = mediaHooks.useUpload(exhibitionId);
  const update = mediaHooks.useUpdate(exhibitionId);
  const reorder = mediaHooks.useReorder(exhibitionId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ caption: "", altText: "" });

  const startEdit = (item: ExhibitionMedia) => {
    setEditingId(item.id);
    setForm({ caption: item.caption ?? "", altText: item.altText ?? "" });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload.mutate({ file }, {
      onSuccess: () => toast.success("Image uploaded"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed — you may have reached the 20-image limit"),
    });
  };

  const move = (idx: number, dir: -1 | 1) => reorder.mutate(reorderPayload(items, idx, idx + dir), { onError: () => toast.error("Reorder failed") });

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-lg">Gallery</h2>
          <p className="text-sm text-muted-foreground">Upload clear exhibition/product images (up to 20).</p>
        </div>
        {canEdit && items.length < 20 && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild disabled={upload.isPending}>
            <label className="cursor-pointer">
              <Upload className="w-4 h-4" />
              {upload.isPending ? "Uploading..." : "Add Images"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            </label>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3"><Skeleton className="aspect-square" /><Skeleton className="aspect-square" /></div>
      ) : items.length === 0 ? (
        <EmptyHint>Add event photos to showcase your exhibition.</EmptyHint>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item, idx) => (
            <div key={item.id} className={`relative rounded-lg overflow-hidden border ${item.active ? "border-border" : "border-border/50 opacity-60"}`}>
              <div className="aspect-square bg-muted">
                <img src={item.imageUrl} alt={item.altText ?? ""} className="w-full h-full object-cover" />
              </div>
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="w-6 h-6 rounded bg-card/90 flex items-center justify-center disabled:opacity-30" aria-label="Move earlier">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="w-6 h-6 rounded bg-card/90 flex items-center justify-center disabled:opacity-30" aria-label="Move later">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-2 space-y-1 bg-card">
                {editingId === item.id ? (
                  <>
                    <Input value={form.altText} maxLength={150} placeholder="Alt text" onChange={(e) => setForm({ ...form, altText: e.target.value })} className="h-8 text-xs" />
                    <Input value={form.caption} maxLength={300} placeholder="Caption" onChange={(e) => setForm({ ...form, caption: e.target.value })} className="h-8 text-xs" />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs" onClick={() => update.mutate({ id: item.id, altText: form.altText, caption: form.caption }, { onSuccess: () => setEditingId(null) })}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" className="text-xs text-left w-full truncate hover:text-primary" onClick={() => canEdit && startEdit(item)}>
                      {item.altText || <span className="italic text-muted-foreground">No alt text — click to add</span>}
                    </button>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">{item.active ? "Active" : "Hidden"}</Label>
                      <Switch checked={item.active} onCheckedChange={(v) => update.mutate({ id: item.id, active: v })} />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Content() {
  const { exhibition, canEdit } = useOutletContext<EventWorkspaceContext>();

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-8 divide-y divide-border [&>section]:pt-8 [&>section:first-child]:pt-0">
      <p className="text-sm text-muted-foreground -mb-4">
        This information appears on your public exhibition page.
      </p>
      <MediaSection exhibitionId={exhibition.id} canEdit={canEdit} />
      <ScheduleSection exhibitionId={exhibition.id} canEdit={canEdit} />
      <HighlightsSection exhibitionId={exhibition.id} canEdit={canEdit} />
      <AudienceSection exhibitionId={exhibition.id} canEdit={canEdit} />
      <FAQSection exhibitionId={exhibition.id} canEdit={canEdit} />
    </div>
  );
}
