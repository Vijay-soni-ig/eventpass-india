import { useEffect, useState } from "react";
import { Plus, Search, Archive, Pencil, RotateCcw, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  usePlatformEventCategories,
  usePlatformEventCategoryOptions,
  usePlatformEventCategory,
  useCreateEventCategory,
  useUpdateEventCategory,
  useArchiveEventCategory,
  type PlatformEventCategory,
} from "@/hooks/platform/usePlatformAdmin";

const EMPTY = { name: "", slug: "", description: "", parentCategoryId: "", active: true, sortOrder: 0 };
const PAGE_SIZE = 25;

export default function EventCategories() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<"order" | "name" | "newest" | "oldest">("order");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformEventCategory | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [archiveTarget, setArchiveTarget] = useState<PlatformEventCategory | null>(null);
  const [parentSelectorOpen, setParentSelectorOpen] = useState(false);
  const [parentSearchInput, setParentSearchInput] = useState("");
  const [parentSearch, setParentSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, error } = usePlatformEventCategories({
    search,
    active: showArchived ? "all" : "true",
    sort,
    page,
    limit: PAGE_SIZE,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setParentSearch(parentSearchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [parentSearchInput]);

  const { data: parentOptions, isFetching: parentOptionsFetching } = usePlatformEventCategoryOptions(parentSearch);
  const { data: selectedParent } = usePlatformEventCategory(form.parentCategoryId || undefined);

  const createCategory = useCreateEventCategory();
  const updateCategory = useUpdateEventCategory();
  const archiveCategory = useArchiveEventCategory();

  const categories = data?.categories ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setParentSearchInput("");
    setParentSearch("");
    setParentSelectorOpen(false);
    setDialogOpen(true);
  };
  const openEdit = (category: PlatformEventCategory) => {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      parentCategoryId: category.parentCategoryId ?? "",
      active: category.active,
      sortOrder: category.sortOrder,
    });
    setParentSearchInput("");
    setParentSearch("");
    setParentSelectorOpen(false);
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) { toast.error("Category name is required"); return; }
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      description: form.description.trim() || undefined,
      parentCategoryId: form.parentCategoryId || null,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
    };
    const onSuccess = () => { setDialogOpen(false); toast.success(editing ? "Category updated" : "Category created"); };
    const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save category");
    if (editing) updateCategory.mutate({ id: editing.id, ...payload }, { onSuccess, onError });
    else createCategory.mutate(payload, { onSuccess, onError });
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    archiveCategory.mutate(archiveTarget.id, {
      onSuccess: () => {
        toast.success("Category archived");
        setArchiveTarget(null);
        if (categories.length === 1 && page > 1) setPage(page - 1);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not archive category"),
    });
  };

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Event Categories</h1>
        <p className="text-muted-foreground">Manage the global event taxonomy used by organizers.</p>
      </div>
      <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add category</Button>
    </div>

    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, slug or description..." />
        </div>
        <Select value={sort} onValueChange={(value) => { setSort(value as typeof sort); setPage(1); }}>
          <SelectTrigger className="w-full lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="order">Sort order</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <Checkbox checked={showArchived} onCheckedChange={(v) => { setShowArchived(v === true); setPage(1); }} />
          Show archived
        </label>
      </CardContent>
    </Card>

    {isLoading ? <Card><CardContent className="py-12 text-center text-muted-foreground">Loading categories…</CardContent></Card> :
      isError ? <Card><CardContent className="py-12 text-center text-destructive">{error instanceof Error ? error.message : "Failed to load categories"}</CardContent></Card> :
      categories.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{search ? "No categories match your search." : "No categories found."}</CardContent></Card> :
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{total} categor{total === 1 ? "y" : "ies"}</CardTitle>
          {isFetching && !isLoading ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category) => <div key={category.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">{category.name}</p>
                <Badge variant={category.active ? "default" : "secondary"}>{category.active ? "Active" : "Archived"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{category.slug}{category.description ? ` · ${category.description}` : ""}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(category)}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
              {category.active
                ? <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(category)}><Archive className="mr-2 h-4 w-4" />Archive</Button>
                : <Button variant="ghost" size="sm" onClick={() => updateCategory.mutate({ id: category.id, active: true }, { onSuccess: () => toast.success("Category restored"), onError: (e) => toast.error(e instanceof Error ? e.message : "Could not restore category") })}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>}
            </div>
          </div>)}

          {totalPages > 1 ? <Pagination className="pt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : ""}
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                />
              </PaginationItem>
              <PaginationItem><span className="px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span></PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination> : null}
        </CardContent>
      </Card>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto-generated if blank" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Parent category</Label>
            <Popover open={parentSelectorOpen} onOpenChange={setParentSelectorOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={parentSelectorOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedParent?.name ??
                      (parentOptions?.categories.find((category) => category.id === form.parentCategoryId)?.name ??
                        "No parent")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search parent categories..."
                    value={parentSearchInput}
                    onValueChange={setParentSearchInput}
                  />
                  <CommandList>
                    <CommandItem
                      value="none"
                      onSelect={() => {
                        setForm({ ...form, parentCategoryId: "" });
                        setParentSelectorOpen(false);
                      }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${!form.parentCategoryId ? "opacity-100" : "opacity-0"}`} />
                      No parent
                    </CommandItem>
                    {parentOptionsFetching && !parentOptions ? (
                      <CommandItem value="loading" disabled>Searching...</CommandItem>
                    ) : null}
                    {!parentOptionsFetching && parentOptions?.categories.length === 0 ? (
                      <CommandEmpty>No active categories found.</CommandEmpty>
                    ) : null}
                    {(parentOptions?.categories ?? [])
                      .filter((category) => category.id !== editing?.id)
                      .map((category) => (
                        <CommandItem
                          key={category.id}
                          value={category.id}
                          onSelect={() => {
                            setForm({ ...form, parentCategoryId: category.id });
                            setParentSelectorOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${form.parentCategoryId === category.id ? "opacity-100" : "opacity-0"}`} />
                          {category.name}
                        </CommandItem>
                      ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Search the platform taxonomy to select any active parent category.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2 pt-8 text-sm"><Checkbox checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v === true })} />Active</label>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={submit} disabled={createCategory.isPending || updateCategory.isPending}>{editing ? "Save changes" : "Create category"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Archive category?</AlertDialogTitle><AlertDialogDescription>This will hide the category from new organizer event creation. Existing events keep their category.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
