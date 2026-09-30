import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateStall, useUpdateStall } from "@/hooks/exhibitor/useExhibitions";
import type { Stall, StallType } from "@/types/exhibitor";

interface StallFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exhibitions: Array<{ id: string; name: string }>;
  /** Exhibition preselected when adding a stall. */
  defaultExhibitionId?: string;
  /** When set, the dialog edits this stall; otherwise it creates a new one. */
  stall?: (Stall & { exhibitionId: string }) | null;
}

const STALL_TYPES: Array<{ value: StallType; label: string }> = [
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
  { value: "basic", label: "Basic" },
];

export function StallFormDialog({ open, onOpenChange, exhibitions, defaultExhibitionId, stall }: StallFormDialogProps) {
  const isEdit = !!stall;
  const [exhibitionId, setExhibitionId] = useState(defaultExhibitionId ?? "");
  const [code, setCode] = useState("");
  const [stallType, setStallType] = useState<StallType>("standard");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const targetExhibitionId = stall?.exhibitionId ?? exhibitionId;
  const createStall = useCreateStall(targetExhibitionId);
  const updateStall = useUpdateStall(targetExhibitionId);
  const pending = createStall.isPending || updateStall.isPending;

  // The server only lets a free, never-booked stall change code/type/size/price.
  // Locking the fields here is a courtesy; the API is what enforces it.
  const commercialLocked = isEdit && stall!.status !== "available";

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (stall) {
      setCode(stall.code ?? "");
      setStallType(stall.stallType ?? "standard");
      setSize(stall.size ?? "");
      setPrice(String(Number(stall.price)));
    } else {
      setExhibitionId(defaultExhibitionId ?? exhibitions[0]?.id ?? "");
      setCode("");
      setStallType("standard");
      setSize("");
      setPrice("");
    }
  }, [open, stall, defaultExhibitionId, exhibitions]);

  const handleSubmit = () => {
    if (pending) return;
    if (!targetExhibitionId) return setError("Choose an exhibition.");
    const priceNumber = Number(price);
    if (price.trim() === "" || !Number.isFinite(priceNumber) || priceNumber < 0) return setError("Enter a price of 0 or more.");
    setError(null);

    const onError = (err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");

    if (stall) {
      updateStall.mutate(
        { id: stall.id, code: code.trim(), stallType, size: size.trim(), price: priceNumber },
        {
          onSuccess: () => {
            toast.success("Stall updated");
            onOpenChange(false);
          },
          onError,
        },
      );
    } else {
      createStall.mutate(
        { code: code.trim() || undefined, stallType, size: size.trim() || undefined, price: priceNumber },
        {
          onSuccess: () => {
            toast.success("Stall added");
            onOpenChange(false);
          },
          onError,
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit stall" : "Add stall"}</DialogTitle>
          <DialogDescription>
            {commercialLocked
              ? "This stall is reserved or sold, so its code, type, size and price are locked."
              : "Stall type, size and price are what exhibitors see when they choose a stall."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="stall-exhibition">Exhibition</Label>
              <Select value={exhibitionId} onValueChange={setExhibitionId}>
                <SelectTrigger id="stall-exhibition">
                  <SelectValue placeholder="Select exhibition" />
                </SelectTrigger>
                <SelectContent>
                  {exhibitions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stall-code">Stall code</Label>
              <Input id="stall-code" placeholder="e.g. A-01" value={code} onChange={(e) => setCode(e.target.value)} disabled={commercialLocked} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stall-type">Type</Label>
              <Select value={stallType} onValueChange={(v) => setStallType(v as StallType)} disabled={commercialLocked}>
                <SelectTrigger id="stall-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STALL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stall-size">Size</Label>
              <Input id="stall-size" placeholder="e.g. 4x4m" value={size} onChange={(e) => setSize(e.target.value)} disabled={commercialLocked} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stall-price">Price (₹)</Label>
              <Input
                id="stall-price"
                type="number"
                min={0}
                inputMode="decimal"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={commercialLocked}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || commercialLocked}>
            {pending ? "Saving..." : isEdit ? "Save changes" : "Add stall"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
