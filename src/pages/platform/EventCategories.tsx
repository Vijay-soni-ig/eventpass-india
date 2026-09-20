import { useMemo, useState } from "react";
import { Plus, Search, Archive, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { usePlatformEventCategories, useCreateEventCategory, useUpdateEventCategory, useArchiveEventCategory, type PlatformEventCategory } from "@/hooks/platform/usePlatformAdmin";

const EMPTY = { name: "", slug: "", description: "", parentCategoryId: "", active: true, sortOrder: 0 };

export default function EventCategories() {
  const { data: categories = [], isLoading, isError, error } = usePlatformEventCategories();
  const createCategory = useCreateEventCategory();
  const updateCategory = useUpdateEventCategory();
  const archiveCategory = useArchiveEventCategory();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformEventCategory | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [archiveTarget, setArchiveTarget] = useState<PlatformEventCategory | null>(null);

  const visible = useMemo(() => categories.filter((c) =>
    (showArchived || c.active) &&
    (!search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()) || c.slug.toLowerCase().includes(search.trim().toLowerCase()))
  ), [categories, search, showArchived]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (category: PlatformEventCategory) => {
    setEditing(category);
    setForm({ name: category.name, slug: category.slug, description: category.description ?? "", parentCategoryId: category.parentCategoryId ?? "", active: category.active, sortOrder: category.sortOrder });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    const payload = { name: form.name.trim(), slug: form.slug.trim() || undefined, description: form.description.trim() || undefined, parentCategoryId: form.parentCategoryId || null, active: form.active, sortOrder: Number(form.sortOrder) || 0 };
    const onSuccess = () => { setDialogOpen(false); toast.success(editing ? "Category updated" : "Category created"); };
    const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save category");
    if (editing) updateCategory.mutate({ id: editing.id, ...payload }, { onSuccess, onError });
    else createCategory.mutate(payload, { onSuccess, onError });
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    archiveCategory.mutate(archiveTarget.id, {
      onSuccess: () => { toast.success("Category archived"); setArchiveTarget(null); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not archive category"),
    });
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold">Event Categories</h1><p className="text-muted-foreground">Manage the global event taxonomy used by organizers.</p></div>
      <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add category</Button>
    </div>
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories..." /></div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />Show archived</label>
      </CardContent>
    </Card>
    {isLoading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Loading categories…</CardContent></Card> :
      isError ? <Card><CardContent className="py-12 text-center text-destructive">{error instanceof Error ? error.message : "Failed to load categories"}</CardContent></Card> :
      visible.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No categories found.</CardContent></Card> :
      <Card><CardHeader><CardTitle className="text-base">{visible.length} categor{visible.length === 1 ? "y" : "ies"}</CardTitle></CardHeader><CardContent className="space-y-3">
        {visible.map((category) => <div key={category.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-medium">{category.name}</p><Badge variant={category.active ? "default" : "secondary"}>{category.active ? "Active" : "Archived"}</Badge></div><p className="text-xs text-muted-foreground">{category.slug}{category.description ? ` · ${category.description}` : ""}</p></div>
          <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(category)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>{category.active ? <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(category)}><Archive className="mr-2 h-4 w-4" />Archive</Button> : <Button variant="ghost" size="sm" onClick={() => { updateCategory.mutate({ id: category.id, active: true }, { onSuccess: () => toast.success("Category restored"), onError: (e) => toast.error(e instanceof Error ? e.message : "Could not restore category") }); }}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>}</div>
        </div>)}
      </CardContent></Card>}
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated if blank" /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="space-y-2"><Label>Parent category</Label><Select value={form.parentCategoryId || "none"} onValueChange={(v) => setForm({ ...form, parentCategoryId: v === "none" ? "" : v })}><SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger><SelectContent><SelectItem value="none">No parent</SelectItem>{categories.filter((c) => c.id !== editing?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></div><label className="flex items-center gap-2 pt-8 text-sm"><Checkbox checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v === true })} />Active</label></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={submit} disabled={createCategory.isPending || updateCategory.isPending}>{editing ? "Save changes" : "Create category"}</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive category?</AlertDialogTitle><AlertDialogDescription>This will hide the category from new organizer event creation. Existing events keep their category.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
