import { useRef, useState } from "react";
import { toast } from "sonner";
import { Images, Plus, Star, Trash2, Pencil, Lock, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { GalleryLightbox } from "@/components/organizer/GalleryLightbox";
import { useAuth } from "@/hooks/useAuth";
import { hasOrganizerPermission } from "@/lib/permissions";
import {
  useOrganizerGallery,
  useUploadGalleryItem,
  useUpdateGalleryItem,
  useSetGalleryItemStatus,
  useSetGalleryItemFeatured,
  useArchiveGalleryItem,
  useBulkGalleryAction,
  useReorderGallery,
  type GalleryFilter,
} from "@/hooks/organizer/useOrganizerGallery";
import type { OrganizerGalleryMedia } from "@/types/exhibitor";

const FILTERS: { value: GalleryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "featured", label: "Featured" },
  { value: "archived", label: "Archived" },
];

export default function Gallery() {
  const { user } = useAuth();
  const canManage = hasOrganizerPermission(user?.roles, "organizerGallery:manage");

  const [filter, setFilter] = useState<GalleryFilter>("all");
  const { data: items = [], isLoading, isError, refetch } = useOrganizerGallery(filter, "custom");

  const uploadItem = useUploadGalleryItem();
  const updateItem = useUpdateGalleryItem();
  const setStatus = useSetGalleryItemStatus();
  const setFeatured = useSetGalleryItemFeatured();
  const archiveItem = useArchiveGalleryItem();
  const bulkAction = useBulkGalleryAction();
  const reorderGallery = useReorderGallery();

  // Manual reorder only makes sense against the unfiltered, custom-order
  // list — reordering within a filtered subset (e.g. "Featured") would
  // silently reassign sortOrder values that don't reflect adjacency in the
  // full gallery. No drag-and-drop library exists in this codebase (see
  // Phase 22.2 inspection notes), so this uses plain up/down buttons on the
  // existing Button primitive rather than introduce a new dependency.
  const canReorder = filter === "all";
  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    reorderGallery.mutate(
      [
        { id: a.id, sortOrder: b.sortOrder },
        { id: b.id, sortOrder: a.sortOrder },
      ],
      { onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to reorder") }
    );
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadAltText, setUploadAltText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<OrganizerGalleryMedia | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editAltText, setEditAltText] = useState("");

  const [lightboxItem, setLightboxItem] = useState<OrganizerGalleryMedia | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setIsUploadOpen(true);
  };

  const handleUploadConfirm = () => {
    if (!pendingFile) return;
    uploadItem.mutate(
      { file: pendingFile, caption: uploadCaption || undefined, altText: uploadAltText || undefined },
      {
        onSuccess: () => {
          toast.success("Image added to gallery");
          setIsUploadOpen(false);
          setPendingFile(null);
          setUploadCaption("");
          setUploadAltText("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to upload image"),
      }
    );
  };

  const openEdit = (item: OrganizerGalleryMedia) => {
    setEditingItem(item);
    setEditCaption(item.caption ?? "");
    setEditAltText(item.altText ?? "");
  };

  const handleEditSave = () => {
    if (!editingItem) return;
    updateItem.mutate(
      { id: editingItem.id, caption: editCaption || null, altText: editAltText || null },
      {
        onSuccess: () => {
          toast.success("Gallery item updated");
          setEditingItem(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update item"),
      }
    );
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulk = (action: "activate" | "deactivate" | "archive") => {
    bulkAction.mutate(
      { ids: [...selectedIds], action },
      {
        onSuccess: () => {
          toast.success(`Bulk ${action} applied to ${selectedIds.size} item(s)`);
          setSelectedIds(new Set());
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk action failed"),
      }
    );
  };

  if (!canManage) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
        <p>You don't have permission to manage this organizer's gallery. Contact an owner or admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-muted-foreground">Showcase event photos, booths, and highlights on your public profile</p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} className="gap-2" disabled={uploadItem.isPending}>
          <Plus className="w-4 h-4" /> Upload Images
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChosen}
          aria-label="Upload gallery image"
        />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as GalleryFilter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 p-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulk("activate")} disabled={bulkAction.isPending}>
              Activate
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulk("deactivate")} disabled={bulkAction.isPending}>
              Deactivate
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleBulk("archive")} disabled={bulkAction.isPending}>
              Archive
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading gallery..." />
      ) : isError ? (
        <ErrorState description="Couldn't load the gallery." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No images yet"
          description="Upload exhibition photos, booth shots, or venue images to showcase on your public profile."
          action={
            <Button onClick={() => fileInputRef.current?.click()} size="sm" className="gap-2">
              <Plus className="w-4 h-4" /> Upload your first image
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="relative aspect-video bg-muted">
                <button
                  onClick={() => setLightboxItem(item)}
                  className="w-full h-full"
                  aria-label={`View ${item.caption || "gallery image"} full size`}
                >
                  <img src={item.imageUrl} alt={item.altText || item.caption || "Gallery image"} className="w-full h-full object-cover" />
                </button>
                <div className="absolute top-2 left-2">
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.caption || "gallery image"}`}
                    className="bg-background"
                  />
                </div>
                {item.isFeatured && (
                  <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" /> Featured
                  </span>
                )}
                {item.archivedAt && (
                  <span className="absolute bottom-2 left-2 bg-muted text-muted-foreground text-xs font-medium px-2 py-1 rounded-full">
                    Archived
                  </span>
                )}
              </div>
              <div className="p-3 space-y-2">
                <p className="text-sm font-medium truncate">{item.caption || "Untitled"}</p>
                {!item.archivedAt && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.active}
                        onCheckedChange={(checked) => setStatus.mutate({ id: item.id, active: checked })}
                        aria-label={`${item.active ? "Deactivate" : "Activate"} ${item.caption || "gallery image"}`}
                      />
                      <span className="text-xs text-muted-foreground">{item.active ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="flex gap-1">
                      {canReorder && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move earlier in gallery order"
                            disabled={index === 0 || reorderGallery.isPending}
                            onClick={() => moveItem(index, -1)}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Move later in gallery order"
                            disabled={index === items.length - 1 || reorderGallery.isPending}
                            onClick={() => moveItem(index, 1)}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={item.isFeatured ? "Unfeature image" : "Feature image"}
                        onClick={() => setFeatured.mutate({ id: item.id, featured: !item.isFeatured })}
                      >
                        <Star className={`w-4 h-4 ${item.isFeatured ? "fill-primary text-primary" : ""}`} />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Edit caption and alt text" onClick={() => openEdit(item)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Archive image"
                        onClick={() =>
                          archiveItem.mutate(item.id, {
                            onSuccess: () => toast.success("Image archived"),
                            onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to archive"),
                          })
                        }
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload metadata dialog */}
      <Dialog open={isUploadOpen} onOpenChange={(open) => !open && setIsUploadOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add gallery image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="upload-caption">Caption (optional)</Label>
              <Input id="upload-caption" value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="Opening day at Hall 3" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-alt">Alt text (optional)</Label>
              <Input id="upload-alt" value={uploadAltText} onChange={(e) => setUploadAltText(e.target.value)} placeholder="Describe the image for screen readers" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUploadConfirm} disabled={uploadItem.isPending}>
                {uploadItem.isPending ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit metadata dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit gallery item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-caption">Caption</Label>
              <Input id="edit-caption" value={editCaption} onChange={(e) => setEditCaption(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-alt">Alt text</Label>
              <Input id="edit-alt" value={editAltText} onChange={(e) => setEditAltText(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Cancel
              </Button>
              <Button onClick={handleEditSave} disabled={updateItem.isPending}>
                {updateItem.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <GalleryLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </div>
  );
}
