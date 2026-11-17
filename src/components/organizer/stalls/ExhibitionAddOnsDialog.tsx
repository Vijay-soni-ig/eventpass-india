import { useEffect, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useArchiveExhibitionAddOn,
  useCreateExhibitionAddOn,
  useExhibitionAddOns,
  useRestoreExhibitionAddOn,
  useUpdateExhibitionAddOn,
  type ExhibitionAddOn,
} from "@/hooks/organizer/useExhibitionAddOns";

interface ExhibitionAddOnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exhibitionId: string;
  exhibitionName: string;
}

const toLocalDateTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function ExhibitionAddOnsDialog({ open, onOpenChange, exhibitionId, exhibitionName }: ExhibitionAddOnsDialogProps) {
  const { data: addOns = [], isLoading, isError, refetch } = useExhibitionAddOns(exhibitionId, true);
  const createAddOn = useCreateExhibitionAddOn(exhibitionId);
  const updateAddOn = useUpdateExhibitionAddOn(exhibitionId);
  const archiveAddOn = useArchiveExhibitionAddOn(exhibitionId);
  const restoreAddOn = useRestoreExhibitionAddOn(exhibitionId);
  const [editing, setEditing] = useState<ExhibitionAddOn | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [maxQuantity, setMaxQuantity] = useState("1");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = createAddOn.isPending || updateAddOn.isPending || archiveAddOn.isPending || restoreAddOn.isPending;

  useEffect(() => {
    if (!formOpen) return;
    setError(null);
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setPrice(editing ? String(Number(editing.price)) : "");
    setMaxQuantity(String(editing?.maxQuantityPerBooking ?? 1));
    setAvailableFrom(toLocalDateTime(editing?.availableFrom ?? null));
    setAvailableUntil(toLocalDateTime(editing?.availableUntil ?? null));
  }, [formOpen, editing]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: ExhibitionAddOn) => {
    setEditing(item);
    setFormOpen(true);
  };

  const submit = () => {
    if (pending) return;
    const parsedPrice = Number(price);
    const parsedMax = Number(maxQuantity);
    if (!name.trim()) return setError("Enter an add-on name.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 99_999_999.99) return setError("Enter a valid price.");
    if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 50) return setError("Quantity limit must be between 1 and 50.");
    const from = availableFrom ? new Date(availableFrom) : null;
    const until = availableUntil ? new Date(availableUntil) : null;
    if (from && Number.isNaN(from.getTime())) return setError("Enter a valid availability start.");
    if (until && Number.isNaN(until.getTime())) return setError("Enter a valid availability end.");
    if (from && until && from > until) return setError("Availability end must be on or after the start.");

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      price: parsedPrice,
      maxQuantityPerBooking: parsedMax,
      availableFrom: from?.toISOString() ?? null,
      availableUntil: until?.toISOString() ?? null,
    };
    const onSuccess = () => {
      toast.success(editing ? "Add-on updated" : "Add-on created");
      setFormOpen(false);
      setEditing(null);
    };
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : "Couldn't save this add-on.");
    if (editing) updateAddOn.mutate({ id: editing.id, ...payload }, { onSuccess, onError });
    else createAddOn.mutate(payload, { onSuccess, onError });
  };

  const toggleActive = (item: ExhibitionAddOn, checked: boolean) => {
    updateAddOn.mutate({ id: item.id, status: checked ? "active" : "inactive" }, {
      onSuccess: () => toast.success(checked ? "Add-on activated" : "Add-on deactivated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't update add-on"),
    });
  };

  const archive = (item: ExhibitionAddOn) => {
    if (pending) return;
    archiveAddOn.mutate(item.id, {
      onSuccess: () => toast.success("Add-on archived"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't archive add-on"),
    });
  };

  const restore = (item: ExhibitionAddOn) => {
    if (pending) return;
    restoreAddOn.mutate(item.id, {
      onSuccess: () => toast.success("Add-on restored"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't restore add-on"),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Booking add-ons</DialogTitle>
            <DialogDescription>Configure optional extras exhibitors can select while booking a stall at {exhibitionName}.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button onClick={openCreate} disabled={pending}>
              <Plus className="mr-2 h-4 w-4" /> Add add-on
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading add-ons…</p>
          ) : isError ? (
            <div className="py-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Couldn't load booking add-ons.</p>
              <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : addOns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="font-medium">No booking add-ons yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add optional services such as power connections, furniture or extra badges.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {addOns.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      {item.archivedAt && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Archived</span>}
                      {!item.archivedAt && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.status === "active" ? "Active" : "Inactive"}</span>}
                    </div>
                    {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                    <p className="mt-2 text-sm">₹{Number(item.price).toLocaleString("en-IN")} · Up to {item.maxQuantityPerBooking} per booking</p>
                    {(item.availableFrom || item.availableUntil) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Availability: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Any time"} – {item.availableUntil ? new Date(item.availableUntil).toLocaleString() : "No end date"}
                      </p>
                    )}
                  </div>
                  {!item.archivedAt ? (
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="flex items-center gap-2">
                        <Switch checked={item.status === "active"} onCheckedChange={(checked) => toggleActive(item, checked)} disabled={pending} aria-label={`Activate ${item.name}`} />
                        <span className="text-xs text-muted-foreground">Active</span>
                      </div>
                      <Button size="icon" variant="outline" onClick={() => openEdit(item)} disabled={pending} aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="outline" onClick={() => archive(item)} disabled={pending} aria-label={`Archive ${item.name}`}><Archive className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={() => restore(item)} disabled={pending}><RotateCcw className="mr-2 h-4 w-4" /> Restore</Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(next) => !pending && setFormOpen(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit booking add-on" : "Create booking add-on"}</DialogTitle>
            <DialogDescription>Prices are stored by ExhibitTix and will be validated by the server when booking integration is added.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addon-name">Name</Label>
              <Input id="addon-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} placeholder="e.g. Power connection" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addon-description">Description (optional)</Label>
              <Textarea id="addon-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={2} placeholder="Describe what's included" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addon-price">Price (₹)</Label>
                <Input id="addon-price" type="number" min="0" max="99999999.99" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addon-quantity">Maximum quantity per booking</Label>
                <Input id="addon-quantity" type="number" min="1" max="50" step="1" value={maxQuantity} onChange={(event) => setMaxQuantity(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addon-from">Available from (optional)</Label>
                <Input id="addon-from" type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addon-until">Available until (optional)</Label>
                <Input id="addon-until" type="datetime-local" value={availableUntil} onChange={(event) => setAvailableUntil(event.target.value)} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : editing ? "Save changes" : "Create add-on"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
